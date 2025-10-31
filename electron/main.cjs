const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('path')

const isDev = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL

// Workaround GPU/VAAPI issues on some Linux drivers
app.disableHardwareAcceleration()

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		backgroundColor: '#0a1f22',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			nodeIntegration: false,
			contextIsolation: true,
		},
	})

	win.webContents.setWindowOpenHandler(({ url }) => {
		// Open external links in default browser
		shell.openExternal(url)
		return { action: 'deny' }
	})

	if (isDev) {
		const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
		win.loadURL(devUrl)
		win.webContents.openDevTools({ mode: 'detach' })
	} else {
		win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
	}
}

app.whenReady().then(() => {
    // Native menu with copy/paste accelerators
    const template = [
        { role: 'appMenu', visible: process.platform === 'darwin' },
        { role: 'fileMenu' },
        { role: 'editMenu' }, // includes Undo/Redo/Cut/Copy/Paste/Select All
        { role: 'viewMenu' },
        { role: 'windowMenu' }
    ]
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)

	createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})


