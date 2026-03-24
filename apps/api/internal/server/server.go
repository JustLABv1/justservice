package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/justlab/justservice/api/internal/admin"
	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/executor"
	"github.com/justlab/justservice/api/internal/middleware"
	"github.com/justlab/justservice/api/internal/plugin"
	"github.com/justlab/justservice/api/internal/rbac"
)

func New(
	authSvc *auth.Service,
	authHandler *auth.Handler,
	rbacSvc *rbac.Service,
	registry *plugin.Registry,
	execHandler *executor.Handler,
	adminHandler *admin.Handler,
) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "https://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", authHandler.Login)
			r.Post("/register", authHandler.Register)
			r.Post("/refresh", authHandler.Refresh)
			r.Post("/logout", authHandler.Logout)
			r.Get("/oidc/providers", authHandler.ListOIDCProviders)
			r.Get("/oidc/{providerID}/authorize", authHandler.OIDCAuthorize)
			r.Get("/oidc/{providerID}/callback", authHandler.OIDCCallback)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(authSvc))

			r.Get("/auth/me", authHandler.Me)

			r.Route("/tasks", func(r chi.Router) {
				r.Get("/", execHandler.ListTasks)
				r.Get("/{slug}", execHandler.GetTask)
				r.With(middleware.RequirePermission(rbacSvc, rbac.PermTaskExecute)).
					Post("/{slug}/execute", execHandler.ExecuteTask)
			})

			r.Route("/executions", func(r chi.Router) {
				r.Get("/", execHandler.ListExecutions)
				r.Get("/{id}", execHandler.GetExecution)
				r.Get("/{id}/stream", execHandler.StreamExecution)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(authSvc))
			r.Use(middleware.RequirePermission(rbacSvc, rbac.PermAdminAccess))

			r.Route("/admin", func(r chi.Router) {
				r.Get("/stats", adminHandler.Stats)
				r.Get("/executions", adminHandler.ListExecutions)
				r.Get("/users", adminHandler.ListUsers)
				r.Get("/plugins", adminHandler.ListPlugins)
				r.Delete("/plugins/{id}", adminHandler.DeregisterPlugin)
				r.Get("/roles", adminHandler.ListRoles)
				r.Get("/permissions", adminHandler.ListPermissions)
				r.Get("/oidc", adminHandler.ListOIDCProviders)
				r.Post("/oidc", adminHandler.CreateOIDCProvider)
				r.Get("/audit-log", adminHandler.AuditLog)
			})
		})
	})

	return r
}
