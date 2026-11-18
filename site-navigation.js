/* Shared scrolling controls for the public site. */
(function () {
  'use strict';
  function init() {
    const header = document.querySelector('.site-header');
    if (!header || document.querySelector('.back-to-top')) return;
    const nav = header.querySelector('.main-nav');
    if (nav) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'compact-menu-toggle';
      toggle.textContent = 'Menu';
      nav.id = nav.id || 'site-primary-navigation';
      toggle.setAttribute('aria-controls', nav.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu điều hướng');
      nav.before(toggle);
      header.classList.add('has-compact-menu');
      function setMenu(open) {
        header.classList.toggle('compact-menu-open', open);
        header.classList.remove('header-scroll-hidden');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Đóng menu điều hướng' : 'Mở menu điều hướng');
      }
      toggle.addEventListener('click', function () {
        setMenu(toggle.getAttribute('aria-expanded') !== 'true');
      });
      document.addEventListener('click', function (event) {
        if (toggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) setMenu(false);
      });
      header.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
          setMenu(false);
          toggle.focus();
        }
      });
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) setMenu(false);
      });
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-to-top';
    button.hidden = true;
    button.title = 'Về đầu trang';
    button.setAttribute('aria-label', 'Về đầu trang');
    button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 13 6-6 6 6M12 7v13M5 3h14"/></svg>';
    document.body.appendChild(button);
    let previousY = Math.max(0, window.scrollY);
    let scheduled = false;
    function update() {
      const y = Math.max(0, window.scrollY);
      if (y <= header.offsetHeight || header.contains(document.activeElement) || header.classList.contains('compact-menu-open')) {
        header.classList.remove('header-scroll-hidden');
        previousY = y;
      } else if (Math.abs(y - previousY) >= 8) {
        header.classList.toggle('header-scroll-hidden', y > previousY);
        previousY = y;
      }
      button.hidden = y < 300;
      scheduled = false;
    }
    window.addEventListener('scroll', function () {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    header.addEventListener('focusin', function () {
      header.classList.remove('header-scroll-hidden');
    });
    button.addEventListener('click', function () {
      header.classList.remove('header-scroll-hidden');
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      // Move keyboard focus out of the floating control before it disappears.
      const home = header.querySelector('.brand-logo');
      if (home) home.focus({ preventScroll: true });
    });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
