# 📦 Azure Blob Storage + Front Door (Public Access + Managed Identity Setup)

This guide explains how to:

* Create Azure Blob Storage
* Upload files (videos)
* Configure Azure Front Door
* Enable Managed Identity
* Access content publicly via Front Door

---

# 🏗️ Architecture

```id="p4m3hz"
User → Azure Front Door → Azure Blob Storage → Content
```

---

# 🚀 Step 1: Create Storage Account

1. Go to Azure Portal → **Storage Accounts**
2. Click **Create**

### Configure:

* **Name**: `videostreamstorage`
* **Region**: As required
* **Performance**: Standard
* **Redundancy**: LRS

3. Click **Review + Create**
4. Click **Create**

---

# 📁 Step 2: Create Container

1. Open Storage Account
2. Go to **Data Storage → Containers**
3. Click **+ Container**

### Configure:

* **Name**: `livewire`
* **Public access level**:

  ```
  Blob (anonymous read access for blobs only)
  ```

4. Click **Create**

---

# 📤 Step 3: Upload Files

Upload files in this structure:

```id="y07tmo"
livewire/
 └── <video-id>/
      └── mp4/
           └── output.mp4
```

---

# 🌐 Step 4: Create Azure Front Door

1. Go to **Azure Front Door (Standard/Premium)**
2. Click **Create**

### Configure:

* **Name**: `livewire`
* **Endpoint**: auto-generated (`*.azurefd.net`)

---

# 🔐 Step 5: Enable Managed Identity (Optional but Recommended)

1. Go to **Front Door → Identity**
2. Enable:

   ```
   System Assigned Managed Identity
   ```
3. Save

---

# 🔑 Step 6: Assign IAM Role (for Managed Identity)

1. Go to **Storage Account → Access Control (IAM)**
2. Click **Add Role Assignment**

### Configure:

* **Role**:

  ```
  Storage Blob Data Reader
  ```
* **Assign access to**:

  ```
  Managed Identity
  ```
* Select:

  ```
  Your Front Door instance
  ```

---

# 🌍 Step 7: Create Origin Group

1. Go to **Front Door → Origin Groups**
2. Click **+ Add**

---

# 🔗 Step 8: Add Origin

### Origin Settings

* **Origin host name**:

  ```
  videostreamstorage.blob.core.windows.net
  ```

* **Status**:

  ```
  Enabled
  ```

* **Priority**:

  ```
  1
  ```

* **Weight**:

  ```
  1000
  ```

---

## ❤️ Health Probes

* **Enabled**
* **Path**:

  ```
  /
  ```
* **Protocol**:

  ```
  HTTPS
  ```
* **Method**:

  ```
  HEAD
  ```
* **Interval**:

  ```
  100 seconds
  ```

---

## ⚖️ Load Balancing

* **Sample size**: `4`
* **Successful samples required**: `3`
* **Latency sensitivity**: `50 ms`

---

## 🔐 Authentication (Managed Identity)

> ⚠️ Use this ONLY if you want to secure storage later

* **Origin Authentication**:

  ```
  Enabled
  ```

* **Type**:

  ```
  System Assigned Managed Identity
  ```

* **Scope**:

  ```
  https://storage.azure.com/.default
  ```

> If storage is public, this can remain disabled.

---

# 🔁 Step 9: Configure Route

Go to **Front Door → Routes → Add**

### Configure:

* **Name**: `default-route`

* **Domain**:

  ```
  <your-endpoint>.azurefd.net
  ```

* **Patterns to match**:

  ```
  /*
  ```

* **Origin group**:

  ```
  Your origin group
  ```

* **Origin path**:

  ```
  (leave empty)
  ```

* **Forwarding protocol**:

  ```
  HTTPS only
  ```

* **Caching**:

  ```
  Enabled (recommended)
  ```

---

# 🧪 Step 10: Access Content

### URL format:

```id="x4z7c2"
https://<frontdoor-endpoint>/livewire/<video-id>/mp4/output.mp4
```

---

# 🔍 Troubleshooting

### ❌ PublicAccessNotPermitted

* Managed Identity enabled but storage is private
* Either disable auth OR assign IAM role properly

### ❌ ResourceNotFound

* Incorrect path or container name

### ❌ Not Working via Front Door

* Check origin hostname
* Verify route mapping

---

# 🔐 Notes

* Storage can be:

  * Public (simple setup)
  * Private (use Managed Identity)

---

# 🚀 Enhancements

* Enable CDN caching
* Add custom domain
* Use WAF
* Convert videos to HLS (`.m3u8`)

---

# 🏁 Summary

| Mode    | Access         | Auth             |
| ------- | -------------- | ---------------- |
| Public  | Direct         | Not required     |
| Private | Via Front Door | Managed Identity |

---

🎉 You now have a **flexible setup supporting both public and secure access**
