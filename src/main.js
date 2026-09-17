import './style.css';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

function render() {
  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#cdd6f4';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hello, Web Game!', canvas.width / 2, canvas.height / 2);

  requestAnimationFrame(render);
}

render();