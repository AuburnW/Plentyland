import { Bindings } from "./bindings.js";
import { Color } from "./color.js";
import { Transform } from "./transform.js";
import { Draw } from "./draw.js";
import { Atlas } from "./atlas.js";
import { Interpolation } from "./interpolation.js";

let drawCount = 500;

/**
 * 
 * @param {any} value 
 */
function logDraw(value) {
	if (drawCount-- > 0) {
		Bindings.console.warn(value);
	}
}

class DrawContextState {
	computedColor = Color.createRGBA().fill(255);
	color = Color.createRGBA().fill(255);
	globalAlpha = 1;
	transform = Transform.createMatrix();
	/** `true` if the current transform matrix is the identity matrix. */
	isIdentity = true;
}

/**
 * An implementation of `CanvasRenderingContext2D` that forwards calls to WebGL in a worker
 */
export class DrawContext {
	/** @type {DrawContextState[] & [DrawContextState]} */
	stateStack = [new DrawContextState()];
	stateIndex = 0;
	state = this.stateStack[0];

	/** A place to put inputs to matrix calculations without generating garbage */
	inputMatrix = Transform.createMatrix();
	/** A place to put outputs to matrix calculations without generating garbage */
	outputMatrix = Transform.createMatrix();

	/**
	 * 
	 * @param {HTMLCanvasElement} image 
	 * @param {number} sx 
	 * @param {number} sy 
	 * @param {number} sw 
	 * @param {number} sh 
	 * @param {number} dx 
	 * @param {number} dy 
	 * @param {number} dw 
	 * @param {number} dh 
	 */
	drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
		const sourceX = Math.max(Math.floor(sx), 0);
		const sourceY = Math.max(Math.floor(sy), 0);
		const sourceWidth = Math.min(Math.ceil(sw), image.width);
		const sourceHeight = Math.min(Math.ceil(sh), image.height);
		const dx2 = dx + dw;
		const dy2 = dy + dh;
		const transform = this.state.transform;
		let x1;
		let y1;
		let x2;
		let y2;
		if (this.state.isIdentity) {
			x1 = dx;
			y1 = dy;
			x2 = dx2;
			y2 = dy2;
		} else {
			x1 = Transform.getX(dx, dy, transform);
			y1 = Transform.getY(dx, dy, transform);
			x2 = Transform.getX(dx2, dy2, transform);
			y2 = Transform.getY(dx2, dy2, transform);
		}
		x1 = (Draw.xOffset + x1) * Draw.xToScreenX;
		y1 = (Draw.yOffset + y1) * Draw.yToScreenY;
		x2 = (Draw.xOffset + x2) * Draw.xToScreenX;
		y2 = (Draw.yOffset + y2) * Draw.yToScreenY;

		const deltaX = Interpolation.getDeltaX(x1);
		const deltaY = Interpolation.getDeltaY(y1);

		const reservation =
			Atlas.getReservation(image, sourceX, sourceY, sourceWidth, sourceHeight);

		if (!reservation.reserve(image, sourceX, sourceY, sourceWidth, sourceHeight)) {
			// Reservation failed, so skip drawing.
			return;
		}

		const u1 = reservation.x + sx - sourceX;
		const v1 = reservation.y + sy - sourceY;
		const u2 = u1 + sw;
		const v2 = v1 + sh;
		Draw.rectangle(
			x1 - deltaX,
			y1 - deltaY,
			x2 - deltaX,
			y2 - deltaY,
			deltaX,
			deltaY,
			u1,
			v2,
			u2,
			v1,
			this.state.computedColor
		);
	}
	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} w 
	 * @param {number} h 
	 */
	fillRect(x, y, w, h) {
		logDraw({ fillRect: [x, y, w, h] });
	}

	save() {
		this.stateIndex++;
		let state = this.stateStack[this.stateIndex];
		if (state === undefined) {
			state = new DrawContextState();
			this.stateStack[this.stateIndex] = state;
		}
		state.color.set(this.state.color);
		state.computedColor.set(this.state.computedColor);
		state.globalAlpha = this.state.globalAlpha;
		state.transform.set(this.state.transform);
		state.isIdentity = this.state.isIdentity;
		this.state = state;
	}

	restore() {
		this.stateIndex--;
		const state = this.stateStack[this.stateIndex];
		if (state === undefined) {
			this.stateIndex = 0;
		} else {
			this.state = state;
		}
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 */
	scale(x, y) {
		Transform.scale(x, y, this.state.transform);
		this.state.isIdentity = false;
	}

	beginPath() {
		logDraw("Began path");
	}

	closePath() {
		logDraw("Closed path");
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} width 
	 * @param {number} height 
	 */
	rect(x, y, width, height) {
		logDraw({ rect: [x, y, width, height] });
	}

	/**
	 * 
	 * @param {"nonzero" | "evenodd" | Path2D=} ruleOrPath 
	 * @param {"nonzero" | "evenodd"=} rule 
	 */
	fill(ruleOrPath, rule) {
		logDraw({ fill: [ruleOrPath, rule] });
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 */
	translate(x, y) {
		Transform.translate(x, y, this.state.transform);
		this.state.isIdentity = false;
	}

	/**
	 * 
	 * @param {number} radians
	 */
	rotate(radians) {
		logDraw({ rotate: [radians] });
	}

	/**
	 * 
	 * @param {number} x0 
	 * @param {number} y0 
	 * @param {number} r0 
	 * @param {number} x1 
	 * @param {number} y1 
	 * @param {number} r1 
	 * @returns 
	 */
	createRadialGradient(x0, y0, r0, x1, y1, r1) {
		logDraw({ createRadialGradient: [x0, y0, r0, x1, y1, r1] });
		return new DrawGradient();
	}

	/**
	 * 
	 * @param {number} x0 
	 * @param {number} y0 
	 * @param {number} x1 
	 * @param {number} y1 
	 */
	createLinearGradient(x0, y0, x1, y1) {
		logDraw({ createLinearGradient: [x0, y0, x1, y1] });
		return new DrawGradient();
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 */
	moveTo(x, y) {
		logDraw({ moveTo: [x, y] });
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} radius 
	 * @param {number} startRadians 
	 * @param {number} endRadians 
	 * @param {boolean=} counterClockwise 
	 */
	arc(x, y, radius, startRadians, endRadians, counterClockwise) {
		logDraw({ arc: [x, y, radius, startRadians, endRadians, counterClockwise] });
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 */
	lineTo(x, y) {
		logDraw({ lineTo: [x, y] });
	}

	/**
	 * 
	 * @param {"string"|object} fillRuleOrPath 
	 * @param {"string"} fillRule 
	 */
	clip(fillRuleOrPath, fillRule) {
		logDraw({ clip: [fillRuleOrPath, fillRule] });
	}

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} width 
	 * @param {number} height 
	 */
	strokeRect(x, y, width, height) {
		logDraw({ strokeRect: [x, y, width, height] });
	}

	/**
	 * 
	 * @param {Path2D=} path 
	 */
	stroke(path) {
		logDraw({ stroke: path });
	}

	get globalAlpha() { return this.state.globalAlpha }
	set globalAlpha(value) {
		if (value >= 0 && value <= 1) {
			this.state.globalAlpha = value;
			this.state.computedColor.set(this.state.color);
			this.state.computedColor[3] = /** @type {any} */(this.state.computedColor[3]) * value;
		}
	}
}

class DrawGradient {
	/**
	 * 
	 * @param {number} offset 
	 * @param {string} color 
	 */
	addColorStop(offset, color) {

	}
}