# Matrix_IPTV

Open source IPTV Player for Linux, and Windows. (Mac OS soon)

This project is built with **Electron** and **React (Vite)**. It is ready for stable release!

---

## 📥 Get the Application (End-Users)

The easiest way to run this application is to download a packaged installer directly from the GitHub Releases page.

1.  Go to the **Releases** tab on this repository.
2.  Download the appropriate file for your operating system:
    * **Windows:** `Matrix_IPTV Setup 0.1.0.exe` (Installer)
    * **Linux:** `Matrix_IPTV-0.1.0.AppImage` (Portable Executable)

---

## 🚀 Running Locally (Developer Setup)

Follow these steps if you want to develop, modify, or debug the application.

### What You'll Need

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (v18 or newer is recommended)

### Setup Steps

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Jtorres160/Matrix_IPTV.git](https://github.com/Jtorres160/Matrix_IPTV.git)
    ```

2.  **Navigate into the project directory:**
    ```bash
    cd Matrix_IPTV
    ```

3.  **Install all dependencies:**
    ```bash
    npm install
    ```

4.  **Run the desktop app:**
    ```bash
    npm run desktop
    ```

### ⚙️ Build and Package (Developer Only)

To generate the final distributable files (`.exe`, `.AppImage`, `.dmg`):

```bash
npm run package
