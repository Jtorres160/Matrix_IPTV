# Matrix_IPTV
Open source IPTV player for Mac, Linux and Windows
Matrix_IPTV

Open source IPTV player for Mac, Linux, and Windows.

This project is built with Electron and React (Vite). Here's how to get it running on your local machine for development.

Running Locally

What You'll Need

    Git

    Node.js (v18 or newer is recommended)

Setup Steps

    Clone the repository:
    Bash

git clone https://github.com/Jtorres160/Matrix_IPTV.git

Navigate into the project directory:
Bash

cd Matrix_IPTV

Install all the dependencies: This will download React, Electron, and all other necessary packages.
Bash

npm install

Run the desktop app:
Bash

    npm run desktop

...and that's it! This one command handles everything. It boots up the Vite development server and launches the Electron application at the same time.

How it Works

The npm run desktop script uses concurrently to run two commands in parallel:

    npm run dev: Starts the Vite/React app on http://localhost:5173.

    npm run electron: Starts the Electron shell, which is configured to load the app from that localhost URL.
