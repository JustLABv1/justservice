package middleware

import (
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/rbac"
	"github.com/justlab/justservice/api/internal/respond"
	"github.com/google/uuid"
)

func Authenticate(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.ExtractBearerToken(r)
			if token == "" {
				respond.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			claims, err := authSvc.ValidateAccessToken(token)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			ctx := auth.SetClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func OptionalAuthenticate(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.ExtractBearerToken(r)
			if token != "" {
				if claims, err := authSvc.ValidateAccessToken(token); err == nil {
					r = r.WithContext(auth.SetClaims(r.Context(), claims))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequirePermission(rbacSvc *rbac.Service, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.GetClaims(r.Context())
			if !ok {
				respond.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			userID, err := uuid.Parse(claims.UserID)
			if err != nil {
				respond.Error(w, http.StatusForbidden, "forbidden")
				return
			}
			ok, err = rbacSvc.HasPermission(r.Context(), userID, permission)
			if err != nil || !ok {
				respond.Error(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(ww, r)
		log.Info().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", ww.status).
			Dur("duration", time.Since(start)).
			Str("remote", r.RemoteAddr).
			Msg("request")
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}
