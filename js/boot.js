// Runs before first paint: enables the scroll-reveal styles and refuses to run inside a frame.
document.documentElement.classList.add('js');
if (window.top !== window.self) document.documentElement.hidden = true;
