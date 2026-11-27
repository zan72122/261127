import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const game = new Game(params);
window.__game = game;
await game.init();
