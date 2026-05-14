// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Open dashboard in new window
function openDashboard() {
    // Open the actual dashboard
    const dashboardWindow = window.open('/dashboard', '_blank', 'width=1400,height=900');
    
    if (dashboardWindow) {
        // Show notification
        showNotification('Dashboard opened! Live monitoring active.');
        
        // Optional: Start simulation if test endpoint exists
        setTimeout(() => {
            startSimulation();
        }, 2000);
    } else {
        alert('Please allow popups to view the dashboard');
    }
}

// Start simulation by calling test data sender
async function startSimulation() {
    try {
        const response = await fetch('/api/start-simulation', {
            method: 'POST'
        });
        
        if (response.ok) {
            console.log('Simulation started successfully');
        }
    } catch (error) {
        console.log('Note: Manual simulation start required. Run: node test-data-sender.js');
    }
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #06b6d4 0%, #a855f7 100%);
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        font-weight: 600;
        font-size: 0.9375rem;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 50) {
        navbar.style.background = 'rgba(10, 14, 26, 0.95)';
        navbar.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.4)';
    } else {
        navbar.style.background = 'rgba(10, 14, 26, 0.85)';
        navbar.style.boxShadow = 'none';
    }
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -80px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections
document.querySelectorAll('section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(section);
});

console.log('TraceMind Landing Page Loaded');
console.log('Click "Live Demo" to launch the monitoring dashboard');
