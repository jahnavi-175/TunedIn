TunedIn 🎧
TunedIn is a full-stack web application that allows users to seamlessly transfer their music playlists between Spotify and YouTube Music. It leverages the official APIs of both platforms, utilizing secure OAuth 2.0 token exchanges and cross-origin session management to safely authenticate users and automate the migration of their music libraries.

✨ Features
Bi-directional Transfer: Move playlists from Spotify to YouTube Music, or vice versa.

Secure Authentication: Implements industry-standard OAuth 2.0 flows for both Google and Spotify. User credentials are never seen or stored.

RESTful API Architecture: A decoupled frontend and backend communicating via REST API endpoints with secure, cross-domain cookie management.

Asynchronous Processing: Handles rate-limiting and bulk data fetching gracefully during the transfer process.

Glassmorphic UI: A clean, responsive, and aesthetic dark-themed dashboard using modern CSS.

🛠️ Tech Stack
Frontend: HTML5, CSS3, Vanilla JavaScript

Backend: Node.js, Express.js

Authentication: OAuth 2.0, express-session

HTTP Client: Axios

APIs: Spotify Web API, YouTube Data API v3

Deployment: Render (Backend), Vercel (Frontend)

🚀 How It Works
Authentication: The user clicks a connect button and is securely redirected to the provider's authorization page (Spotify/Google).

Token Exchange: Once approved, the provider redirects back to the TunedIn backend with an authorization code. The backend exchanges this code for access and refresh tokens.

Session Management: Tokens are securely stored in a server-side session variable linked to the user's browser via a secure SameSite=None cookie.

Data Fetching: The frontend requests the user's playlists from the backend, which proxies the request to the respective platform's API using the stored access token.

Transfer Logic: When a transfer is initiated, the backend reads the tracks from the source playlist, creates a new private playlist on the destination platform, and systematically searches for and adds each track.

💻 Local Development Setup
To run this project locally, you will need Node.js installed on your machine.

1. Clone the repository
Bash
git clone https://github.com/yourusername/TunedIn.git
cd TunedIn/backend
2. Install dependencies
Bash
npm install
3. Environment Variables
Create a .env file in the backend directory and add the following keys. You will need to obtain these by creating developer applications on the Spotify Developer Dashboard and Google Cloud Console.

Code snippet
# Spotify Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Google/YouTube Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Application Settings
SESSION_SECRET=a_secure_random_string_here
FRONTEND_URL=http://localhost:5500 
4. Start the Backend Server
Bash
node server.js
5. Start the Frontend
Open the frontend/index.html file using a local development server (like the VS Code "Live Server" extension). Ensure the BACKEND_URL variable in the index.html script tag is set to http://localhost:3000.

⚠️ Important Note on API Quotas
Currently, this application relies on unverified, development-tier API access.

Google: New users may see an "Unverified App" warning. Click Advanced -> Go to tunedin... to bypass this.

Spotify: Access is restricted to explicitly whitelisted developer accounts.
