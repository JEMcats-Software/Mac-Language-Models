
const { app, BrowserWindow } = require('electron');
const { execSync, spawn } = require('child_process');
const sudo = require('sudo-prompt');
const express = require('express');
const expressapp = express();
const fs = require('fs');

function checkDependencies() {
    const dependencies = {
        PY: 'python3 --version', // Python
        PYV: 'test -d ./exo/venv', // Python Virtual Environment
        EI: 'cd exo && source ./venv/bin/activate && python3 exo/main.py && cd ../ && deactivate', // Exo Installed
    };

    const results = {};

    const checkEIWithTimeout = async () => {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const process = spawn('bash', ['-c', dependencies.EI]);

            let isResolved = false;

            // Set timeout to terminate the process after 5 seconds
            const timeout = setTimeout(() => {
                if (!isResolved) {
                    process.kill(); // Kill the process
                    isResolved = true;
                    resolve(true); // Mark as installed
                }
            }, 5000);

            // On process close or exit
            process.on('close', (code) => {
                if (!isResolved) {
                    clearTimeout(timeout);
                    isResolved = true;
                    resolve(code === 0); // Check exit code
                }
            });

            process.on('error', () => {
                if (!isResolved) {
                    clearTimeout(timeout);
                    isResolved = true;
                    resolve(false); // Mark as not installed on error
                }
            });
        });
    };

    // Check all dependencies
    return new Promise(async (resolve) => {
        for (const [key, command] of Object.entries(dependencies)) {
            try {
                if (key === 'EI') {
                    results[key] = await checkEIWithTimeout(); // Run EI check with timeout
                } else {
                    execSync(command, { stdio: 'ignore' }); // Run other commands synchronously
                    results[key] = true; // If the command runs successfully
                }
            } catch (error) {
                results[key] = false; // If the command fails
            }
        }

        // Check if all dependencies are true
        const allAvailable = Object.values(results).every((status) => status === true);

        // If all are available, resolve true; otherwise, resolve the results
        resolve(allAvailable ? true : results);
    });
}

// Initialize variables for Electron windows
let mainWindow;
let installPopup;

// Function to restart the app
function restartApp() {
    app.relaunch();
    app.exit();
}

// Express server setup
let serverPort;
const server = expressapp.listen(0, () => {
    serverPort = server.address().port; // Get the assigned random port
    console.log(`Server is running on port ${serverPort}`);
});

expressapp.get('/restart_app', (req, res) => { 
    restartApp()
})

// Define an Express route
expressapp.get('/install_dependency', (req, res) => {
    const allowedDependencies = ['HB', 'PY', 'PYV', 'EI'];
    const dependency = req.query.dependency;

    // Validate the dependency parameter
    if (!allowedDependencies.includes(dependency)) {
        res.status(400).send('Invalid Dependency');
        return;
    }

    switch (dependency) {
        case 'PY':
            console.log("Installing Python:");
            res.status(200).send("Python installation not implemented yet.");
            break;
        case 'PYV':
            console.log("Creating the Python venv:");
            try {
                execSync(`python3 -m venv ./exo/venv && test -d ./exo/venv`);
                res.statusCode = 200;
                res.send(`Install Complete`);
            } catch (error) {
                res.statusCode = 500;
                res.send(`Install Failed`);
            }
            break;
        case 'EI':
            console.log("Installing Exo:");
            if (!fs.existsSync('./exo')) {
                res.status(500).send('Exo directory not found');
                return;
            }

            const command = `
                cd exo && \
                source ./venv/bin/activate && \
                pip3 install . && \
                pip3 install mlx && \
                ./configure_mlx.sh && \
                cd ../ && deactivate
            `;

            const options = {
                name: 'Exo Installer', // Name displayed in the sudo prompt
            };

            sudo.exec(command, options, async (error, stdout, stderr) => {
                if (error) {
                    console.log("Error occurred during installation. Waiting 5 seconds before verifying...");
                    // Wait for 5 seconds before checking dependencies
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    const dependenciesAvailable = await checkDependencies();
                    if (dependenciesAvailable === true) {
                        console.log('Install completed successfully after verification:', stdout);
                        res.status(200).send('Install Complete');
                    } else {
                        console.error('Install failed after verification:', error.message);
                        console.error('Error details:', stderr);
                        res.status(500).send(`Install Failed: ${stderr || 'Unknown error'}`);
                    }
                    return;
                }
            
                console.log('Install completed successfully:', stdout);
                res.status(200).send('Install Complete');
            });
            break;
        default:
            res.status(404).send(`Could Not Find A ${dependency} Dependency`);
            break;
    }
});

// Electron app setup
app.on('ready', async () => {
    const dependenciesAvailable = await checkDependencies();

    if (dependenciesAvailable !== true) {
        installPopup = new BrowserWindow({
            width: 740,
            height: 360,
            webPreferences: {
                nodeIntegration: true, // Leaving this unchanged as per request
            },
        });

        const url = `file://${__dirname}/install_popup.html?installed=${encodeURIComponent(
            JSON.stringify(dependenciesAvailable)
        )}&port=${serverPort}`;
        installPopup.loadURL(url);

        installPopup.on('closed', () => {
            installPopup = null;
        });
    } else {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true, // Leaving this unchanged as per request
            },
        });

        mainWindow.loadFile('index.html');

        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    }
});

// Handle Electron window-all-closed event
app.on('window-all-closed', () => {
    app.quit();
});