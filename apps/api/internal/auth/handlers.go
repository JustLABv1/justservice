package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/respond"
)

type contextKey int

const claimsKey contextKey = 0

const (
	oidcStateCookieName = "oidc_state"
	oidcNextCookieName  = "oidc_next"
)

func SetClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}

func GetClaims(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*Claims)
	return claims, ok
}

type Handler struct {
	svc           *Service
	oidcProviders map[string]*OIDCProvider
}

func NewHandler(svc *Service, oidcProviders map[string]*OIDCProvider) *Handler {
	return &Handler{svc: svc, oidcProviders: oidcProviders}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Password == "" {
		respond.Error(w, http.StatusBadRequest, "username and password required")
		return
	}
	pair, err := h.svc.LoginLocal(r.Context(), body.Username, body.Password)
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	respond.JSON(w, http.StatusOK, pair)
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Username == "" || body.Email == "" || body.Password == "" {
		respond.Error(w, http.StatusBadRequest, "username, email, and password required")
		return
	}
	if len(body.Password) < 8 {
		respond.Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	user, err := h.svc.RegisterLocal(r.Context(), body.Username, body.Email, body.Password)
	if err != nil {
		log.Error().Err(err).Msg("register user")
		respond.Error(w, http.StatusConflict, "username or email already taken")
		return
	}
	respond.JSON(w, http.StatusCreated, user)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		log.Warn().Str("error", err.Error()).Msg("refresh: no cookie in request")
		respond.Error(w, http.StatusUnauthorized, "no refresh token")
		return
	}
	pair, err := h.svc.RefreshTokens(r.Context(), cookie.Value)
	if err != nil {
		log.Warn().Str("error", err.Error()).Msg("refresh: token validation failed")
		// Clear the stale cookie so the browser doesn't keep sending it and
		// the Next.js middleware stops treating the user as authenticated.
		http.SetCookie(w, &http.Cookie{
			Name:     "refresh_token",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
			Expires:  time.Unix(0, 0),
		})
		respond.Error(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	respond.JSON(w, http.StatusOK, pair)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("refresh_token"); err == nil {
		h.svc.RevokeRefreshToken(r.Context(), cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:    "refresh_token",
		Value:   "",
		Path:    "/",
		Expires: time.Unix(0, 0),
		MaxAge:  -1,
	})
	respond.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := GetClaims(r.Context())
	if !ok {
		respond.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}
	user, err := h.svc.GetUserByID(r.Context(), userID)
	if err != nil {
		respond.Error(w, http.StatusNotFound, "user not found")
		return
	}
	respond.JSON(w, http.StatusOK, map[string]any{
		"user":        user,
		"roles":       claims.Roles,
		"permissions": claims.Permissions,
	})
}

func (h *Handler) OIDCAuthorize(w http.ResponseWriter, r *http.Request) {
	next := sanitizeRedirectPath(r.URL.Query().Get("next"))
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		redirectOIDCError(w, r, next, "OIDC provider not found")
		return
	}
	state, err := GenerateState()
	if err != nil {
		redirectOIDCError(w, r, next, "failed to start OIDC sign-in")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookieName,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   300,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     oidcNextCookieName,
		Value:    next,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   300,
	})
	http.Redirect(w, r, p.AuthCodeURL(state), http.StatusFound)
}

func (h *Handler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	next := readOIDCNext(r)
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "OIDC provider not found")
		return
	}
	if err := ValidateState(r, r.URL.Query().Get("state")); err != nil {
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "invalid OIDC state")
		return
	}
	idToken, err := p.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		log.Error().Err(err).Msg("OIDC exchange")
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "OIDC authentication failed")
		return
	}
	// Parse all claims at once so we can read both standard and role claims.
	var allClaims map[string]any
	if err := idToken.Claims(&allClaims); err != nil {
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "failed to parse OIDC claims")
		return
	}
	sub, _ := allClaims["sub"].(string)
	email, _ := allClaims["email"].(string)
	username, _ := allClaims["preferred_username"].(string)
	if username == "" {
		username, _ = allClaims["name"].(string)
	}
	if username == "" {
		username = email
	}

	// Resolve application roles from OIDC token when a roles_claim is configured.
	var rolesToSync []string
	if p.model.RolesClaim != "" {
		rolesToSync = resolveRoles(allClaims, p.model.RolesClaim, p.model.RoleMappings)
		if rolesToSync == nil {
			// Claim configured but nothing matched — treat as empty sync so
			// the user still gets a safe fallback ("user") rather than keeping
			// whatever roles they had before.
			rolesToSync = []string{}
		}
	}

	user, err := h.svc.UpsertOIDCUser(r.Context(), sub, p.model.IssuerURL, email, username, rolesToSync)
	if err != nil {
		log.Error().Err(err).Msg("upsert OIDC user")
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "failed to create user")
		return
	}
	pair, err := h.svc.issueTokens(r.Context(), *user)
	if err != nil {
		clearOIDCCookies(w)
		redirectOIDCError(w, r, next, "failed to issue tokens")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	clearOIDCCookies(w)
	http.Redirect(w, r, next, http.StatusFound)
}

func (h *Handler) ListOIDCProviders(w http.ResponseWriter, r *http.Request) {
	type publicProvider struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var result []publicProvider
	for id, p := range h.oidcProviders {
		result = append(result, publicProvider{ID: id, Name: p.model.Name})
	}
	respond.JSON(w, http.StatusOK, result)
}

func sanitizeRedirectPath(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") {
		return "/"
	}
	return raw
}

func readOIDCNext(r *http.Request) string {
	cookie, err := r.Cookie(oidcNextCookieName)
	if err != nil {
		return "/"
	}
	return sanitizeRedirectPath(cookie.Value)
}

func clearOIDCCookies(w http.ResponseWriter) {
	for _, name := range []string{oidcStateCookieName, oidcNextCookieName} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
			Expires:  time.Unix(0, 0),
		})
	}
}

func redirectOIDCError(w http.ResponseWriter, r *http.Request, next, message string) {
	redirectURL := &url.URL{Path: "/login"}
	query := redirectURL.Query()
	query.Set("oidc_error", message)
	if next != "/" {
		query.Set("next", next)
	}
	redirectURL.RawQuery = query.Encode()
	http.Redirect(w, r, redirectURL.String(), http.StatusFound)
}
