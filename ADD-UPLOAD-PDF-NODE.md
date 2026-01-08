# Add "Upload PDF to Storage" HTTP Node

The storage bucket `route-pdfs` has been created successfully!

## Step 1: Add the HTTP Request Node

1. In n8n workflow editor, open "Stocker - PDF Upload" workflow
2. Click the **+** button between "Webhook" and "Extract PDF Text" nodes
3. Search for "HTTP Request"
4. Add the HTTP Request node
5. Rename it to: **Upload PDF to Storage**

## Step 2: Configure the HTTP Request Node

### Authentication
1. Click "Add Credential" under Authentication
2. Select "Header Auth" as credential type
3. Credential Name: `Supabase Service Role`
4. Configure the credential:
   - **Name**: `apikey`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8`
5. Save the credential

### Request Settings
- **Method**: `POST`
- **URL**:
```
=https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/route-pdfs/{{ $json.body.date }}/{{ $json.body.user_id }}_{{ $now.format('HHmmss') }}.pdf
```

### Headers
Click "Add Parameter" in the Headers section twice and add:

1. **Header 1**:
   - Name: `Authorization`
   - Value: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8`

2. **Header 2**:
   - Name: `Content-Type`
   - Value: `application/pdf`

### Body Settings
- **Send Body**: Yes
- **Body Content Type**: Raw/Custom
- **Content Type**: `application/pdf`
- **Body**:
```
={{ $binary.pdf.data }}
```

### Options
- **Response → Response Format**: JSON

## Step 3: Update Workflow Connections

**Current flow:**
```
Webhook → Extract PDF Text → Parse PDF Text → ...
```

**New flow:**
```
Webhook → Upload PDF to Storage → Extract PDF Text → Parse PDF Text → ...
```

**Actions:**
1. Delete the connection from "Webhook" to "Extract PDF Text"
2. Connect "Webhook" output to "Upload PDF to Storage" input
3. Connect "Upload PDF to Storage" output to "Extract PDF Text" input

## Step 4: Test the Upload

1. Save the workflow
2. Upload a test PDF via the app
3. Check the n8n execution log - "Upload PDF to Storage" should succeed
4. Verify the response has a `path` field (e.g., `"2024-01-15/user123_143052.pdf"`)
5. Check Supabase Dashboard → Storage → route-pdfs → you should see the PDF file

## Troubleshooting

**"Authentication failed"**
- Verify the `apikey` credential and `Authorization` header have the correct service_role key
- The service_role key should start with `eyJhbGci...`

**"Bucket not found"**
- The bucket `route-pdfs` was created - verify the URL uses this exact name

**"Cannot read binary.pdf"**
- Make sure this node is connected AFTER the Webhook node
- The Webhook receives the PDF as binary data named `pdf`

**PDF upload succeeds but no path in response**
- Check the Response Format is set to JSON
- The Supabase Storage API returns `{"path": "2024-01-15/user123_143052.pdf"}`
