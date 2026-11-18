/* Reveal content on entry without hiding it before JavaScript is ready. */
(function () {
  'use strict';
  function init() {
    const main = document.querySelector('main');
    if (!main || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;

    const selector = [
      'main > section:not(.home-intro)',
      'main .section-header-center',
      'main .section-heading-lg',
      'main .learning-roadmap-header',
      'main .what-is-left',
      'main .illustration-frame',
      'main .feature-card-item',
      'main .learning-roadmap-steps > li',
      'main .lms-heading',
      'main .lms-course-card',
      'main .lms-info-section',
      'main .lms-box'
    ].join(',');
    const seen = new WeakSet();
    const active = new Map();
    const observer = new IntersectionObserver(function (entries) {
      let order = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (motion.matches || entry.boundingClientRect.bottom <= 0 || entry.target.contains(document.activeElement)) return;
        const animation = entry.target.animate([
          { opacity: 0, translate: '0 20px' },
          { opacity: 1, translate: '0 0' }
        ], {
          duration: 600,
          delay: Math.min(order++ * 70, 210),
          easing: 'cubic-bezier(.22, 1, .36, 1)',
          fill: 'backwards'
        });
        active.set(entry.target, animation);
        animation.onfinish = animation.oncancel = function () { active.delete(entry.target); };
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    function register() {
      const candidates = Array.from(main.querySelectorAll(selector));
      // Animate a content block or its children, never both at once.
      const targets = candidates.filter(function (element) {
        return !candidates.some(function (other) { return other !== element && element.contains(other); });
      });
      targets.forEach(function (element) {
        if (seen.has(element)) return;
        seen.add(element);
        const rect = element.getBoundingClientRect();
        // The first screen stays stable; only content reached by scrolling animates.
        if (rect.height > 0 && rect.top < window.innerHeight - 40) return;
        observer.observe(element);
      });
    }
    register();

    let scheduled = false;
    const mutations = new MutationObserver(function (records) {
      const addedContent = records.some(function (record) {
        return Array.from(record.addedNodes).some(function (node) {
          return node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
        });
      });
      if (!addedContent || scheduled || motion.matches) return;
      scheduled = true;
      window.requestAnimationFrame(function () { scheduled = false; register(); });
    });
    mutations.observe(main, { childList: true, subtree: true });
    document.addEventListener('focusin', function (event) {
      active.forEach(function (animation, element) {
        if (element.contains(event.target)) animation.cancel();
      });
    });
    motion.addEventListener('change', function () {
      if (!motion.matches) return;
      observer.disconnect();
      mutations.disconnect();
      active.forEach(function (animation) { animation.cancel(); });
      active.clear();
    });
    window.addEventListener('beforeprint', function () {
      active.forEach(function (animation) { animation.cancel(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
