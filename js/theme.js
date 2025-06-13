// Theme management
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const currentTheme = localStorage.getItem('theme');
const themeToggle = document.querySelector('.theme-toggle');

function updateButtonText(theme) {
    themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

function initializeTheme() {
    if (currentTheme === 'dark' || (!currentTheme && prefersDarkScheme.matches)) {
        document.body.setAttribute('data-theme', 'dark');
        updateButtonText('dark');
    } else {
        updateButtonText('light');
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateButtonText(newTheme);
}

// Initialize theme when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    initializeTheme();
    
    // Add click handler to theme toggle button
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Listen for system theme changes
    prefersDarkScheme.addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            document.body.setAttribute('data-theme', newTheme);
            updateButtonText(newTheme);
        }
    });
}); 