import { Bindings } from "./bindings.js";
import { initializeAudio } from "./audio.js";
import { Draw } from "./draw.js";
import { Interpolation } from "./interpolation.js";

/** @type {any} */(window).ig.module("plugins.plentyland").requires(
	"impact.sound",
	"plugins.mland-soundextensions",
	"game.core.brainmanager"
).defines(() => {
	Bindings.initialize();
	Bindings.ig.game.pl_player.say("plentyland active");
	initializeAudio();
	Draw.initialize().then(() => {
		Interpolation.initialize();
	});
});