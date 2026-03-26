package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/justlab/justservice/api/internal/admin"
	"github.com/justlab/justservice/api/internal/auth"
	"github.com/justlab/justservice/api/internal/config"
	"github.com/justlab/justservice/api/internal/db"
	"github.com/justlab/justservice/api/internal/executor"
	"github.com/justlab/justservice/api/internal/plugin"
	"github.com/justlab/justservice/api/internal/rbac"
	"github.com/justlab/justservice/api/internal/server"
)

func main() {
	configPath := flag.String("config", "", "path to config.yaml (default: looks for config.yaml in . and ./config)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.Log.Format == "console" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}
	level, err := zerolog.ParseLevel(cfg.Log.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	database, err := db.Connect(&cfg.Database)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to database")
	}
	defer database.Close()

	if err := db.Migrate(&cfg.Database); err != nil {
		log.Fatal().Err(err).Msg("run migrations")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	rbacSvc := rbac.New(database)
	authSvc := auth.New(database, &cfg.JWT, rbacSvc)

	if err := auth.ReconcileOIDCProviders(ctx, database, cfg.OIDC.BootstrapProviders); err != nil {
		log.Fatal().Err(err).Msg("reconcile OIDC providers")
	}

	baseURL := cfg.OIDC.PublicBaseURL
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%d", cfg.Server.Port)
	}
	oidcProviders, err := auth.LoadOIDCProviders(ctx, database, baseURL)
	if err != nil {
		log.Warn().Err(err).Msg("load OIDC providers")
		oidcProviders = map[string]*auth.OIDCProvider{}
	}

	authHandler := auth.NewHandler(authSvc, oidcProviders)

	registry := plugin.NewRegistry(database)
	registry.StartHealthMonitor(ctx)

	go func() {
		if err := plugin.ListenAndServeGRPC(ctx, cfg.GRPC.Addr(), registry); err != nil {
			log.Error().Err(err).Msg("gRPC server stopped")
		}
	}()

	execSvc := executor.New(database, registry)
	execHandler := executor.NewHandler(execSvc, database, registry)
	adminHandler := admin.New(database)

	handler := server.New(authSvc, authHandler, rbacSvc, registry, execHandler, adminHandler)
	httpServer := &http.Server{
		Addr:         cfg.Server.Addr(),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", cfg.Server.Addr()).Msg("HTTP server listening")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("HTTP server error")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
