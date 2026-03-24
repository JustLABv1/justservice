package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/respond"
)

type contextKey int

const claimsKey contextKey = 0

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
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
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
		respond.Error(w, http.StatusUnauthorized, "no refresh token")
		return
	}
	pair, err := h.svc.RefreshTokens(r.Context(), cookie.Value)
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
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
		Path:    "/api/auth",
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
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		respond.Error(w, http.StatusNotFound, "OIDC provider not found")
		return
	}
	state, err := GenerateState()
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to generate state")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/api/auth/oidc",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   300,
	})
	http.Redirect(w, r, p.AuthCodeURL(state), http.StatusFound)
}

func (h *Handler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	providerID := r.PathValue("providerID")
	p, ok := h.oidcProviders[providerID]
	if !ok {
		respond.Error(w, http.StatusNotFound, "OIDC provider not found")
		return
	}
	if err := ValidateState(r, r.URL.Query().Get("state")); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid state")
		return
	}
	idToken, err := p.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		log.Error().Err(err).Msg("OIDC exchange")
		respond.Error(w, http.StatusUnauthorized, "OIDC authentication failed")
		return
	}
	var stdClaims struct {
		Subject           string `json:"sub"`
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		Name              string `json:"name"`
	}
	if err := idToken.Claims(&stdClaims); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to parse claims")
		return
	}
	username := stdClaims.PreferredUsername
	if username == "" {
		username = stdClaims.Name
	}
	if username == "" {
		username = stdClaims.Email
	}
	user, err := h.svc.UpsertOIDCUser(r.Context(), stdClaims.Subject, p.model.IssuerURL, stdClaims.Email, username)
	if err != nil {
		log.Error().Err(err).Msg("upsert OIDC user")
		respond.Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}
	pair, err := h.svc.issueTokens(r.Context(), *user)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    pair.RefreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	http.Redirect(w, r, "/?token="+pair.AccessToken, http.StatusFound)
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
