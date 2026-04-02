# Terraform: Azure Blob Storage + Front Door (Public Access + Managed Identity)

provider "azurerm" {
  features {}
}

# Resource Group
resource "azurerm_resource_group" "rg" {
  name     = "rg-livewire"
  location = "Central India"
}

# Storage Account
resource "azurerm_storage_account" "storage" {
  name                     = "videostreamstorage"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  allow_blob_public_access = true
}

# Storage Container
resource "azurerm_storage_container" "container" {
  name                  = "livewire"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "blob"
}

# Front Door Profile
resource "azurerm_cdn_frontdoor_profile" "fd_profile" {
  name                = "fd-livewire-profile"
  resource_group_name = azurerm_resource_group.rg.name
  sku_name            = "Standard_AzureFrontDoor"
}

# Front Door Endpoint
resource "azurerm_cdn_frontdoor_endpoint" "fd_endpoint" {
  name                     = "livewire-endpoint"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd_profile.id
}

# Origin Group
resource "azurerm_cdn_frontdoor_origin_group" "origin_group" {
  name                     = "default-origin-group"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.fd_profile.id

  health_probe {
    interval_in_seconds = 100
    path                = "/"
    protocol            = "Https"
    request_type        = "HEAD"
  }

  load_balancing {
    sample_size                        = 4
    successful_samples_required        = 3
    additional_latency_in_milliseconds = 50
  }
}

# Origin
resource "azurerm_cdn_frontdoor_origin" "origin" {
  name                          = "blob-origin"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.origin_group.id

  enabled                        = true
  host_name                      = azurerm_storage_account.storage.primary_blob_endpoint
  origin_host_header             = replace(azurerm_storage_account.storage.primary_blob_endpoint, "https://", "")
  http_port                      = 80
  https_port                     = 443
  priority                       = 1
  weight                         = 1000
}

# Route
resource "azurerm_cdn_frontdoor_route" "route" {
  name                          = "default-route"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.fd_endpoint.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.origin_group.id

  supported_protocols    = ["Http", "Https"]
  patterns_to_match      = ["/*"]
  forwarding_protocol    = "HttpsOnly"
  link_to_default_domain = true
  https_redirect_enabled = true
}

# Managed Identity for Front Door
resource "azurerm_user_assigned_identity" "fd_identity" {
  name                = "fd-identity"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
}

# Role Assignment (Optional - for private access)
resource "azurerm_role_assignment" "storage_reader" {
  scope                = azurerm_storage_account.storage.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.fd_identity.principal_id
}
