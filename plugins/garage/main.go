package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/justlab/justservice/plugins/sdk"
)

// ---------------------------------------------------------------------------
// Garage Admin API types
// ---------------------------------------------------------------------------

type keyListItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type keyDetail struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Name            string `json:"name"`
	Permissions     struct {
		CreateBucket bool `json:"createBucket"`
	} `json:"permissions"`
	Buckets []struct {
		ID            string   `json:"id"`
		GlobalAliases []string `json:"globalAliases"`
		LocalAliases  []string `json:"localAliases"`
		Permissions   struct {
			Read  bool `json:"read"`
			Write bool `json:"write"`
			Owner bool `json:"owner"`
		} `json:"permissions"`
	} `json:"buckets"`
}

type bucketListItem struct {
	ID            string   `json:"id"`
	GlobalAliases []string `json:"globalAliases"`
	LocalAliases  []struct {
		AccessKeyID string `json:"accessKeyId"`
		Alias       string `json:"alias"`
	} `json:"localAliases"`
}

type bucketDetail struct {
	ID            string   `json:"id"`
	GlobalAliases []string `json:"globalAliases"`
	LocalAliases  []string `json:"localAliases"`
	WebsiteAccess bool     `json:"websiteAccess"`
	Objects       int64    `json:"objects"`
	Bytes         int64    `json:"bytes"`
	Keys          []struct {
		AccessKeyID string `json:"accessKeyId"`
		Name        string `json:"name"`
		Permissions struct {
			Read  bool `json:"read"`
			Write bool `json:"write"`
			Owner bool `json:"owner"`
		} `json:"permissions"`
	} `json:"keys"`
}

// ---------------------------------------------------------------------------
// Garage HTTP client
// ---------------------------------------------------------------------------

type garageClient struct {
	baseURL string
	token   string
	http    *http.Client
}

func newGarageClient(baseURL, token string) *garageClient {
	return &garageClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *garageClient) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return data, resp.StatusCode, nil
}

func (c *garageClient) listKeys(ctx context.Context) ([]keyListItem, error) {
	data, code, err := c.do(ctx, http.MethodGet, "/v2/ListKeys", nil)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out []keyListItem
	return out, json.Unmarshal(data, &out)
}

func (c *garageClient) getKey(ctx context.Context, id string) (*keyDetail, error) {
	data, code, err := c.do(ctx, http.MethodGet, "/v2/GetKeyInfo?id="+id, nil)
	if err != nil {
		return nil, err
	}
	if code == http.StatusNotFound {
		return nil, fmt.Errorf("key not found")
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out keyDetail
	return &out, json.Unmarshal(data, &out)
}

func (c *garageClient) createKey(ctx context.Context, name string) (*keyDetail, error) {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/CreateKey", map[string]any{"name": name})
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out keyDetail
	return &out, json.Unmarshal(data, &out)
}

func (c *garageClient) deleteKey(ctx context.Context, id string) error {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/DeleteKey?id="+id, nil)
	if err != nil {
		return err
	}
	if code != http.StatusOK {
		return apiError(code, data)
	}
	return nil
}

func (c *garageClient) listBuckets(ctx context.Context) ([]bucketListItem, error) {
	data, code, err := c.do(ctx, http.MethodGet, "/v2/ListBuckets", nil)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out []bucketListItem
	return out, json.Unmarshal(data, &out)
}

func (c *garageClient) getBucket(ctx context.Context, id string) (*bucketDetail, error) {
	data, code, err := c.do(ctx, http.MethodGet, "/v2/GetBucketInfo?id="+id, nil)
	if err != nil {
		return nil, err
	}
	if code == http.StatusNotFound {
		return nil, fmt.Errorf("bucket not found")
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out bucketDetail
	return &out, json.Unmarshal(data, &out)
}

func (c *garageClient) createBucket(ctx context.Context, globalAlias string) (*bucketDetail, error) {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/CreateBucket", map[string]any{
		"globalAlias": globalAlias,
	})
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, apiError(code, data)
	}
	var out bucketDetail
	return &out, json.Unmarshal(data, &out)
}

func (c *garageClient) deleteBucket(ctx context.Context, id string) error {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/DeleteBucket?id="+id, nil)
	if err != nil {
		return err
	}
	if code != http.StatusOK {
		return apiError(code, data)
	}
	return nil
}

func (c *garageClient) allowKey(ctx context.Context, bucketID, keyID string, read, write bool) error {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/AllowBucketKey", map[string]any{
		"bucketId":    bucketID,
		"accessKeyId": keyID,
		"permissions": map[string]any{"read": read, "write": write, "owner": false},
	})
	if err != nil {
		return err
	}
	if code != http.StatusOK {
		return apiError(code, data)
	}
	return nil
}

func (c *garageClient) denyKey(ctx context.Context, bucketID, keyID string, read, write bool) error {
	data, code, err := c.do(ctx, http.MethodPost, "/v2/DenyBucketKey", map[string]any{
		"bucketId":    bucketID,
		"accessKeyId": keyID,
		"permissions": map[string]any{"read": read, "write": write, "owner": false},
	})
	if err != nil {
		return err
	}
	if code != http.StatusOK {
		return apiError(code, data)
	}
	return nil
}

// apiError extracts a readable message from a non-2xx Garage API response.
func apiError(code int, body []byte) error {
	var e struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &e) == nil && e.Message != "" {
		return fmt.Errorf("garage: %s (HTTP %d)", e.Message, code)
	}
	return fmt.Errorf("garage API returned HTTP %d", code)
}

// ---------------------------------------------------------------------------
// User namespace helpers
// ---------------------------------------------------------------------------

var (
	reUserUnsafe   = regexp.MustCompile(`[^a-z0-9-]`)
	reUserIDUnsafe = regexp.MustCompile(`[^a-z0-9]`)
)

type userScope struct {
	current string
	legacy  string
}

// usernameNS returns the legacy resource-name prefix derived from the username.
// Format: "jus-<sanitizedUsername>-"
// Username is lower-cased, unsafe chars removed, truncated to 20 chars.
func usernameNS(username string) string {
	safe := reUserUnsafe.ReplaceAllString(strings.ToLower(username), "")
	if safe == "" {
		safe = "user"
	}
	if len(safe) > 20 {
		safe = safe[:20]
	}
	return "jus-" + safe + "-"
}

// userIDNS returns the preferred resource-name prefix derived from the stable
// user ID. UUID hyphens are stripped to keep bucket aliases within length limits.
func userIDNS(userID string) string {
	safe := reUserIDUnsafe.ReplaceAllString(strings.ToLower(userID), "")
	if safe == "" {
		return ""
	}
	return "jus-" + safe + "-"
}

func newUserScope(userID, username string) userScope {
	current := userIDNS(userID)
	if current == "" {
		return userScope{current: usernameNS(username)}
	}

	legacy := usernameNS(username)
	if legacy == current {
		legacy = ""
	}

	return userScope{current: current, legacy: legacy}
}

func qualifiedAlias(scope userScope, name string) string { return scope.current + name }

func isOwned(scope userScope, qualName string) bool {
	return strings.HasPrefix(qualName, scope.current) ||
		(scope.legacy != "" && strings.HasPrefix(qualName, scope.legacy))
}

func friendlyName(scope userScope, qualName string) string {
	if strings.HasPrefix(qualName, scope.current) {
		return strings.TrimPrefix(qualName, scope.current)
	}
	if scope.legacy != "" && strings.HasPrefix(qualName, scope.legacy) {
		return strings.TrimPrefix(qualName, scope.legacy)
	}
	return qualName
}

func ownedGlobalAlias(scope userScope, aliases []string) string {
	for _, alias := range aliases {
		if strings.HasPrefix(alias, scope.current) {
			return alias
		}
	}
	if scope.legacy != "" {
		for _, alias := range aliases {
			if strings.HasPrefix(alias, scope.legacy) {
				return alias
			}
		}
	}
	return ""
}

type resolvedBucket struct {
	ID          string
	Name        string
	DisplayName string
}

func resolveOwnedBucket(ctx context.Context, g *garageClient, scope userScope, input string) (*resolvedBucket, error) {
	target := strings.TrimSpace(input)
	if target == "" {
		return nil, fmt.Errorf("bucket name is required")
	}
	all, err := g.listBuckets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list buckets: %w", err)
	}
	qualified := qualifiedAlias(scope, target)
	for _, bucket := range all {
		alias := ownedGlobalAlias(scope, bucket.GlobalAliases)
		if alias == "" {
			continue
		}
		displayName := friendlyName(scope, alias)
		if alias == target || alias == qualified || displayName == target {
			return &resolvedBucket{ID: bucket.ID, Name: alias, DisplayName: displayName}, nil
		}
	}
	return nil, nil
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

var (
	reBucketName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)
	reKeyLabel   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,49}$`)
)

func validateBucketName(scope userScope, name string) error {
	if name == "" {
		return fmt.Errorf("bucket name is required")
	}
	if !reBucketName.MatchString(name) {
		return fmt.Errorf("bucket name must start with a letter or digit and contain only lowercase letters, digits, and hyphens")
	}
	if len(qualifiedAlias(scope, name)) > 63 {
		max := 63 - len(scope.current)
		return fmt.Errorf("bucket name too long - maximum %d characters for your account", max)
	}
	return nil
}

func validateKeyLabel(label string) error {
	if label == "" {
		return fmt.Errorf("key label is required")
	}
	if !reKeyLabel.MatchString(label) {
		return fmt.Errorf("label must start with a letter or digit and contain only letters, digits, spaces, underscores, or hyphens (max 50 chars)")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Task handler wrapper
// ---------------------------------------------------------------------------

type taskHandler struct {
	def sdk.TaskDefinition
	fn  func(ctx context.Context, ec sdk.ExecuteContext) (any, error)
}

func (t taskHandler) Definition() sdk.TaskDefinition { return t.def }
func (t taskHandler) Execute(ctx context.Context, ec sdk.ExecuteContext) (any, error) {
	return t.fn(ctx, ec)
}

// ---------------------------------------------------------------------------
// Task implementations
// ---------------------------------------------------------------------------

func opListBuckets(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	all, err := g.listBuckets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list buckets: %w", err)
	}
	type row struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
	}
	var result []row
	for _, b := range all {
		alias := ownedGlobalAlias(scope, b.GlobalAliases)
		if alias == "" {
			continue
		}
		result = append(result, row{ID: b.ID, Name: alias, DisplayName: friendlyName(scope, alias)})
	}
	if result == nil {
		result = []row{}
	}
	return map[string]any{"buckets": result, "count": len(result)}, nil
}

func opCreateBucket(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	name, _ := ec.Input["name"].(string)
	name = strings.TrimSpace(name)
	if err := validateBucketName(scope, name); err != nil {
		return nil, err
	}
	alias := qualifiedAlias(scope, name)
	b, err := g.createBucket(ctx, alias)
	if err != nil {
		return nil, fmt.Errorf("create bucket: %w", err)
	}
	actualName := ownedGlobalAlias(scope, b.GlobalAliases)
	if actualName == "" {
		actualName = alias
	}
	return map[string]any{
		"id":           b.ID,
		"name":         actualName,
		"display_name": name,
		"message":      fmt.Sprintf("Bucket %q created successfully", name),
	}, nil
}

func opDeleteBucket(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	name, _ := ec.Input["name"].(string)
	bucket, err := resolveOwnedBucket(ctx, g, scope, name)
	if err != nil {
		return nil, err
	}
	if bucket == nil {
		return nil, fmt.Errorf("bucket %q not found", strings.TrimSpace(name))
	}
	if err := g.deleteBucket(ctx, bucket.ID); err != nil {
		return nil, fmt.Errorf("delete bucket: %w", err)
	}
	return map[string]any{
		"name":         bucket.Name,
		"display_name": bucket.DisplayName,
		"deleted":      true,
		"message":      fmt.Sprintf("Bucket %q deleted", bucket.DisplayName),
	}, nil
}

func opGetBucketInfo(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	name, _ := ec.Input["name"].(string)
	bucket, err := resolveOwnedBucket(ctx, g, scope, name)
	if err != nil {
		return nil, err
	}
	if bucket == nil {
		return nil, fmt.Errorf("bucket %q not found", strings.TrimSpace(name))
	}
	b, err := g.getBucket(ctx, bucket.ID)
	if err != nil {
		return nil, fmt.Errorf("get bucket: %w", err)
	}
	actualName := ownedGlobalAlias(scope, b.GlobalAliases)
	if actualName == "" {
		actualName = bucket.Name
	}
	type keyPerm struct {
		KeyID       string `json:"key_id"`
		Name        string `json:"name"`
		Label       string `json:"label"`
		DisplayName string `json:"display_name"`
		Read        bool   `json:"read"`
		Write       bool   `json:"write"`
		Owner       bool   `json:"owner"`
	}
	var keys []keyPerm
	for _, k := range b.Keys {
		if isOwned(scope, k.Name) {
			displayName := friendlyName(scope, k.Name)
			keys = append(keys, keyPerm{
				KeyID:       k.AccessKeyID,
				Name:        k.Name,
				Label:       displayName,
				DisplayName: displayName,
				Read:        k.Permissions.Read,
				Write:       k.Permissions.Write,
				Owner:       k.Permissions.Owner,
			})
		}
	}
	if keys == nil {
		keys = []keyPerm{}
	}
	return map[string]any{
		"id":             b.ID,
		"name":           actualName,
		"display_name":   bucket.DisplayName,
		"objects":        b.Objects,
		"bytes":          b.Bytes,
		"website_access": b.WebsiteAccess,
		"keys":           keys,
	}, nil
}

func opListKeys(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	all, err := g.listKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("list keys: %w", err)
	}
	type row struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Label       string `json:"label"`
		DisplayName string `json:"display_name"`
	}
	var result []row
	for _, k := range all {
		if isOwned(scope, k.Name) {
			displayName := friendlyName(scope, k.Name)
			result = append(result, row{ID: k.ID, Name: k.Name, Label: displayName, DisplayName: displayName})
		}
	}
	if result == nil {
		result = []row{}
	}
	return map[string]any{"keys": result, "count": len(result)}, nil
}

func opCreateKey(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	label, _ := ec.Input["label"].(string)
	label = strings.TrimSpace(label)
	if err := validateKeyLabel(label); err != nil {
		return nil, err
	}
	keyName := qualifiedAlias(scope, label)
	k, err := g.createKey(ctx, keyName)
	if err != nil {
		return nil, fmt.Errorf("create key: %w", err)
	}
	actualName := k.Name
	if actualName == "" {
		actualName = keyName
	}
	return map[string]any{
		"key_id":       k.AccessKeyID,
		"secret_key":   k.SecretAccessKey,
		"name":         actualName,
		"label":        label,
		"display_name": label,
		"warning":      "The secret key is shown only once. Store it securely - it cannot be retrieved again.",
	}, nil
}

func opDeleteKey(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	keyID, _ := ec.Input["key_id"].(string)
	keyID = strings.TrimSpace(keyID)
	if keyID == "" {
		return nil, fmt.Errorf("key_id is required")
	}
	k, err := g.getKey(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("key not found or access denied")
	}
	if !isOwned(scope, k.Name) {
		return nil, fmt.Errorf("access denied: this key does not belong to your account")
	}
	label := friendlyName(scope, k.Name)
	if err := g.deleteKey(ctx, keyID); err != nil {
		return nil, fmt.Errorf("delete key: %w", err)
	}
	return map[string]any{
		"key_id":       keyID,
		"name":         k.Name,
		"label":        label,
		"display_name": label,
		"deleted":      true,
		"message":      fmt.Sprintf("Key %q deleted", label),
	}, nil
}

func opAllowKey(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	keyID, _ := ec.Input["key_id"].(string)
	bucketName, _ := ec.Input["bucket_name"].(string)
	keyID = strings.TrimSpace(keyID)
	bucketName = strings.TrimSpace(bucketName)
	if keyID == "" || bucketName == "" {
		return nil, fmt.Errorf("key_id and bucket_name are both required")
	}
	read := true
	write := false
	if v, ok := ec.Input["read"].(bool); ok {
		read = v
	}
	if v, ok := ec.Input["write"].(bool); ok {
		write = v
	}
	k, err := g.getKey(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("key not found or access denied")
	}
	if !isOwned(scope, k.Name) {
		return nil, fmt.Errorf("access denied: this key does not belong to your account")
	}
	bucket, err := resolveOwnedBucket(ctx, g, scope, bucketName)
	if err != nil {
		return nil, err
	}
	if bucket == nil {
		return nil, fmt.Errorf("bucket %q not found", bucketName)
	}
	if err := g.allowKey(ctx, bucket.ID, keyID, read, write); err != nil {
		return nil, fmt.Errorf("grant access: %w", err)
	}
	return map[string]any{
		"key_id":              keyID,
		"bucket_name":         bucket.Name,
		"bucket_display_name": bucket.DisplayName,
		"read":                read,
		"write":               write,
		"message":             fmt.Sprintf("Access granted: key %q -> bucket %q (read=%v write=%v)", friendlyName(scope, k.Name), bucket.DisplayName, read, write),
	}, nil
}

func opDenyKey(ctx context.Context, g *garageClient, ec sdk.ExecuteContext) (any, error) {
	scope := newUserScope(ec.UserID, ec.Username)
	keyID, _ := ec.Input["key_id"].(string)
	bucketName, _ := ec.Input["bucket_name"].(string)
	keyID = strings.TrimSpace(keyID)
	bucketName = strings.TrimSpace(bucketName)
	if keyID == "" || bucketName == "" {
		return nil, fmt.Errorf("key_id and bucket_name are both required")
	}
	read := true
	write := true
	if v, ok := ec.Input["read"].(bool); ok {
		read = v
	}
	if v, ok := ec.Input["write"].(bool); ok {
		write = v
	}
	k, err := g.getKey(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("key not found or access denied")
	}
	if !isOwned(scope, k.Name) {
		return nil, fmt.Errorf("access denied: this key does not belong to your account")
	}
	bucket, err := resolveOwnedBucket(ctx, g, scope, bucketName)
	if err != nil {
		return nil, err
	}
	if bucket == nil {
		return nil, fmt.Errorf("bucket %q not found", bucketName)
	}
	if err := g.denyKey(ctx, bucket.ID, keyID, read, write); err != nil {
		return nil, fmt.Errorf("revoke access: %w", err)
	}
	return map[string]any{
		"key_id":              keyID,
		"bucket_name":         bucket.Name,
		"bucket_display_name": bucket.DisplayName,
		"read":                read,
		"write":               write,
		"message":             fmt.Sprintf("Access revoked: key %q from bucket %q (read=%v write=%v)", friendlyName(scope, k.Name), bucket.DisplayName, read, write),
	}, nil
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	garageURL := sdk.EnvOrDefault("GARAGE_ADMIN_URL", "http://localhost:3903")
	garageToken := sdk.EnvOrDefault("GARAGE_ADMIN_TOKEN", "")
	if garageToken == "" {
		log.Fatal("[garage] GARAGE_ADMIN_TOKEN env var is required")
	}

	g := newGarageClient(garageURL, garageToken)

	p := &sdk.Plugin{
		Name:        "garage",
		Description: "Manage your personal S3 Garage space: buckets, access keys, and permissions",
		Version:     "1.0.0",
		GRPCAddr:    sdk.EnvOrDefault("GRPC_ADDR", "0.0.0.0:9003"),
		BackendAddr: sdk.EnvOrDefault("BACKEND_GRPC_ADDR", "localhost:9090"),
	}

	// ---- Bucket tasks ----

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "List Buckets", Slug: "garage-list-buckets",
			Description: "List all S3 Garage buckets in your space.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opListBuckets(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Create Bucket", Slug: "garage-create-bucket",
			Description: "Create a new S3 Garage bucket in your space.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"name"},
				"properties": map[string]any{
					"name": map[string]any{
						"type": "string", "title": "Bucket Name",
						"description": "Lowercase letters, digits, and hyphens. Must start with a letter or digit.",
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opCreateBucket(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Delete Bucket", Slug: "garage-delete-bucket",
			Description: "Delete one of your S3 Garage buckets. The bucket must be empty and have no keys attached.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"name"},
				"properties": map[string]any{
					"name": map[string]any{
						"type": "string", "title": "Bucket Name",
						"description": "The name of the bucket to delete (as shown in List Buckets).",
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opDeleteBucket(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Get Bucket Info", Slug: "garage-get-bucket-info",
			Description: "Get details of one of your buckets: size, object count, and linked access keys.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"name"},
				"properties": map[string]any{
					"name": map[string]any{
						"type": "string", "title": "Bucket Name",
						"description": "The name of the bucket to inspect.",
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opGetBucketInfo(ctx, g, ec) },
	})

	// ---- Access key tasks ----

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "List Access Keys", Slug: "garage-list-keys",
			Description: "List all S3 access keys in your space.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opListKeys(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Create Access Key", Slug: "garage-create-key",
			Description: "Create a new S3 access key. The secret key is returned only once - save it immediately.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"label"},
				"properties": map[string]any{
					"label": map[string]any{
						"type": "string", "title": "Key Label",
						"description": "A short descriptive name, e.g. my-app, ci-runner, backups.",
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opCreateKey(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Delete Access Key", Slug: "garage-delete-key",
			Description: "Permanently delete one of your S3 access keys.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"key_id"},
				"properties": map[string]any{
					"key_id": map[string]any{
						"type": "string", "title": "Key ID",
						"description": "The access key ID (from List Access Keys or Create Access Key output).",
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opDeleteKey(ctx, g, ec) },
	})

	// ---- Permission tasks ----

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Grant Key Access", Slug: "garage-allow-key",
			Description: "Grant one of your access keys read and/or write permissions on one of your buckets.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"key_id", "bucket_name"},
				"properties": map[string]any{
					"key_id": map[string]any{
						"type": "string", "title": "Key ID",
						"description": "The access key ID to grant permissions to.",
					},
					"bucket_name": map[string]any{
						"type": "string", "title": "Bucket Name",
						"description": "The bucket to grant access to.",
					},
					"read": map[string]any{
						"type": "boolean", "title": "Read Access",
						"description": "Allow read (GET/HEAD) operations. Default: true.",
						"default":     true,
					},
					"write": map[string]any{
						"type": "boolean", "title": "Write Access",
						"description": "Allow write (PUT/DELETE) operations. Default: false.",
						"default":     false,
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opAllowKey(ctx, g, ec) },
	})

	p.Register(taskHandler{
		def: sdk.TaskDefinition{
			Name: "Revoke Key Access", Slug: "garage-deny-key",
			Description: "Revoke an access key's read and/or write permissions on one of your buckets.",
			Category:    "garage", IsSync: true,
			InputSchema: map[string]any{
				"type": "object", "required": []string{"key_id", "bucket_name"},
				"properties": map[string]any{
					"key_id": map[string]any{
						"type": "string", "title": "Key ID",
						"description": "The access key ID to revoke permissions from.",
					},
					"bucket_name": map[string]any{
						"type": "string", "title": "Bucket Name",
						"description": "The bucket to revoke access from.",
					},
					"read": map[string]any{
						"type": "boolean", "title": "Revoke Read",
						"description": "Revoke read permissions. Default: true.",
						"default":     true,
					},
					"write": map[string]any{
						"type": "boolean", "title": "Revoke Write",
						"description": "Revoke write permissions. Default: true.",
						"default":     true,
					},
				},
			},
		},
		fn: func(ctx context.Context, ec sdk.ExecuteContext) (any, error) { return opDenyKey(ctx, g, ec) },
	})

	if err := p.Run(); err != nil {
		log.Fatal(err)
	}
}
