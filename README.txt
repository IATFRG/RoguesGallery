# Profile Directory Website

Files:
- login.html
- index.html
- group.html
- styles.css
- app.js

## Before publishing
Open app.js and change:
const DEMO_PASSWORD="ChangeThisPassword";

## Publish to Cloudflare Pages
You can upload this ZIP using Cloudflare Pages Direct Upload.
Keep in mind that this is a browser-local application:
- profiles are stored in each browser using localStorage
- the password is only a basic demo gate, not secure authentication
- use Export Backup regularly
