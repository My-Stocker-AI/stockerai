# PDF Storage Setup - Supabase Storage

This adds PDF file storage so you can view the original PDF later for comparison.

---

## Step 1: Create Storage Bucket in Supabase

1. Open Supabase Dashboard → Storage
2. Click "Create a new bucket"
3. Bucket name: `route-pdfs`
4. Set as **Public** (so URLs work without auth)
5. Click "Create bucket"

---

## Step 2: Add "Upload PDF to Storage" Node in n8n

**Position:** Between "Webhook" and "Extract PDF Text"

### Node Configuration:

**Node Type:** HTTP Request
**Name:** Upload PDF to Storage

**Settings:**
- **Method:** POST
- **URL:** `https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/route-pdfs/{{ $('Webhook').item.json.body.date }}/{{ $('Webhook').item.json.body.user_id }}_{{ $now.format('HHmmss') }}.pdf`
- **Authentication:** Generic Credential Type
  - **Credential Type:** Header Auth
  - **Name:** `apikey`
  - **Value:** `<YOUR_SUPABASE_SERVICE_ROLE_KEY>` (get from Supabase Dashboard → Settings → API → service_role key)
- **Send Headers:** Yes
  - Header 1: `Authorization` = `Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>`
  - Header 2: `Content-Type` = `application/pdf`
- **Send Body:** Yes
- **Body Content Type:** Raw/Custom
- **Body:** `={{ $('Webhook').item.binary.pdf }}`

**Response:**
The response will contain a `path` field with the uploaded file path.

---

## Step 3: Update "Flatten Data" Node

Add PDF URL to the route object:

**Find this section (around line 55-62):**
```javascript
return [{
  json: {
    route: {
      user_id: userId,
      route_name: data.route_name,
      delivery_date: date,
      total_machines: machines.length,
      total_items: items.length
    },
```

**Replace with:**
```javascript
// Get PDF URL from Upload PDF to Storage node
var pdfPath = $('Upload PDF to Storage').first().json.path || null;
var pdfUrl = pdfPath ? 'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/' + pdfPath : null;

return [{
  json: {
    route: {
      user_id: userId,
      route_name: data.route_name,
      delivery_date: date,
      total_machines: machines.length,
      total_items: items.length,
      pdf_url: pdfUrl  // NEW: Add PDF URL
    },
```

---

## Step 4: Update Workflow Connections

**Current flow:**
```
Webhook → Extract PDF Text → Parse PDF Text → ...
```

**New flow:**
```
Webhook → Upload PDF to Storage → Extract PDF Text → Parse PDF Text → ...
```

**Action:**
1. Disconnect "Webhook" from "Extract PDF Text"
2. Connect "Webhook" to "Upload PDF to Storage"
3. Connect "Upload PDF to Storage" to "Extract PDF Text"

---

## Alternative: Simpler Approach Using n8n Expression

If the HTTP Request approach is complex, here's a simpler version:

### Create Storage Upload Node:

**Node Type:** Supabase
**Operation:** Upload File
**Bucket:** route-pdfs
**File Path:** `{{ $('Webhook').item.json.body.date }}/{{ $('Webhook').item.json.body.user_id }}_{{ $now.format('HHmmss') }}.pdf`
**File Data:** `={{ $('Webhook').item.binary.pdf }}`

---

## Verification

After uploading a PDF:
1. Check Supabase Storage → route-pdfs bucket → you should see the PDF file
2. Check `routes` table → `pdf_url` column should have a URL
3. Click the URL → it should open the PDF

---

## Troubleshooting

**"Bucket does not exist"**
- Go to Supabase Dashboard → Storage → Create bucket named `route-pdfs`

**"Access denied"**
- Make sure bucket is set to Public
- Check you're using the service_role key (not anon key)

**"File not found"**
- Check the path in the URL matches the uploaded path
- Verify the bucket name is correct in the URL

**PDF URL is null**
- Check "Upload PDF to Storage" node executed successfully
- Check the response contains a `path` field
- Verify Flatten Data node is reading from the correct node name
