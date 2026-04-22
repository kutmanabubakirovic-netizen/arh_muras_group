/* ============================================
   ARH_MURAS_GROUP — animations.js v2.0
   Тёмная тема, анимации скролла, прогресс-бар
   ============================================ */

/* ---- ТЁМНАЯ ТЕМА ---- */
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const savedTheme = localStorage.getItem('archidata_theme') || 'light';
html.setAttribute('data-theme', savedTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const current = html.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', next);
        localStorage.setItem('archidata_theme', next);
    });
}

/* ---- ПРОГРЕСС-БАР СКРОЛЛА ---- */
const progressBar = document.getElementById('scrollProgress');
if (progressBar) {
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.body.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        progressBar.style.width = pct + '%';
    }, { passive: true });
}

/* ---- HEADER SHADOW ON SCROLL ---- */
const siteHeader = document.getElementById('siteHeader');
if (siteHeader) {
    window.addEventListener('scroll', () => {
        siteHeader.style.boxShadow = window.scrollY > 50
            ? '0 4px 40px rgba(0,0,0,0.07)'
            : 'none';
    }, { passive: true });
}

/* ---- REVEAL ANIMATIONS ---- */
const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
if (revealEls.length > 0) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('visible'), i * 60);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => observer.observe(el));
}

/* ---- ФОРМА ЗАЯВКИ (backup, если script.js не подключён) ---- */
if (typeof submitForm === 'undefined') {
    window.submitForm = function(e) {
        e.preventDefault();
        const name  = document.getElementById('cName')?.value.trim();
        const phone = document.getElementById('cPhone')?.value.trim();
        if (!name || !phone) { alert('Заполните имя и телефон'); return; }
        const btn = document.querySelector('.btn-submit-form');
        if (btn) { btn.textContent = 'ОТПРАВЛЯЕМ...'; btn.disabled = true; }
        setTimeout(() => {
            if (btn) { btn.textContent = 'ОТПРАВИТЬ ЗАЯВКУ →'; btn.disabled = false; }
            const success = document.getElementById('formSuccess');
            if (success) { success.classList.add('visible'); }
            document.getElementById('contactForm')?.reset();
            setTimeout(() => success?.classList.remove('visible'), 6000);
        }, 1200);
    };
}
