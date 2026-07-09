# Run locally

npm run dev

# Sanity admin

The Sanity Studio admin is mounted at `/admin`.

Create a Sanity project, then add these environment variables locally and in
Vercel:

```bash
VITE_SANITY_PROJECT_ID=your_project_id
VITE_SANITY_DATASET=production
```

The admin form supports images with:

- Image upload
- Unique Archive Number
- Category selector
- One or more Tags
- Title, description, date, location, notes, and sort order fields
