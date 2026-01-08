# Add PDF Upload Node to n8n Workflow

✅ **Storage bucket `route-pdfs` has been created!**

Now add the upload node to your workflow:

---

## Step 1: Add "Upload PDF to Storage" Node

**Position:** Between "Webhook" and "Extract PDF Text"

### Create the Node:

1. In n8n workflow editor, click the **+** between Webhook and Extract PDF Text
2. Search for "HTTP Request"
3. Add new HTTP Request node
4. Rename it to: **Upload PDF to Storage**

### Configure the HTTP Request Node:

**Authentication:**
- Click "Add Credential"
- Type: "Header Auth"
- Credential Name: "Supabase Service Role"
- **Name:** `apikey`
- **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8`
- Save credential

**Request Settings:**
- **Method:** POST
- **URL:** `=https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/route-pdfs/{{ $json.body.date }}/{{ $json.body.user_id }}_{{ $now.format('HHmmss') }}.pdf`

**Headers:**
Click "Add Parameter" twice and add:
1. **Name:** `Authorization`
   **Value:** `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8`

2. **Name:** `Content-Type`
   **Value:** `application/pdf`

**Body:**
- **Send Body:** Yes
- **Body Content Type:** Raw/Custom
- **Body:** `={{ $binary.pdf.data }}`

**Options:**
- **Response Format:** JSON

---

## Step 2: Update Workflow Connections

**Current:**
```
Webhook → Extract PDF Text → Parse PDF Text
```

**New:**
```
Webhook → Upload PDF to Storage → Extract PDF Text → Parse PDF Text
```

**Actions:**
1. Delete the connection from Webhook to Extract PDF Text
2. Connect Webhook to Upload PDF to Storage
3. Connect Upload PDF to Storage to Extract PDF Text

---

## Step 3: Update "Flatten Data" Node

Replace the ENTIRE code with the code from `FLATTEN-DATA-WITH-PDF.js`

Or just add this section before the `return` statement:

```javascript
// Get PDF URL from Upload PDF to Storage node
var pdfPath = null;
var pdfUrl = null;

try {
  pdfPath = $('Upload PDF to Storage').first().json.path || null;
  if (pdfPath) {
    pdfUrl = 'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/' + pdfPath;
  }
} catch (e) {
  console.log('[INFO] No PDF storage - pdf_url will be null');
}
```

And update the route object to include `pdf_url`:

```javascript
route: {
  user_id: userId,
  route_name: data.route_name,
  delivery_date: date,
  total_machines: machines.length,
  total_items: items.length,
  pdf_url: pdfUrl  // ADD THIS LINE
},
```

---

## Quick Test

After setup:
1. Save the workflow
2. Upload a test PDF via the app
3. Check n8n execution - Upload PDF to Storage should succeed
4. Check Supabase Storage → route-pdfs → you should see the PDF
5. Check routes table → pdf_url should have a clickable URL

---

## Troubleshooting

**"Authentication failed"**
- Double check the apikey and Authorization header values are correct
- Make sure you're using the service_role key, not anon key

**"Bucket not found"**
- The bucket was created as `route-pdfs` - verify the URL has the correct bucket name

**"Cannot read binary.pdf"**
- Make sure this node is connected AFTER the Webhook node
- Webhook should receive the PDF as binary data

**PDF URL is null in database**
- Check Upload PDF to Storage node executed successfully
- Check the response has a `path` field
- Verify Flatten Data is reading from correct node name: `$('Upload PDF to Storage')`
