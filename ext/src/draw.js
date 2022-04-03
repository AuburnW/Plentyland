import { Bindings } from "./bindings.js";
import { Color } from "./color.js";
import { Atlas } from "./atlas.js";
import { DrawContext } from "./draw-context.js";

export class Draw {
	static initialize() {
		const root = String(
			Bindings.self.plentylandRoot ??
			"https://auburn557.github.io/Plentyland/ext/"
		);
		return fetch(String(new URL("src/worker.js", root)))
			.then(response => response.blob())
			.then(blob => {
				/** @type {ClientCommands} */
				const clientCommands = {
					returnBuffer: buffer => {
						Draw.geometryBuffer = new DataView(buffer);
					},
				}
				const workerURL = URL.createObjectURL(blob);
				Draw.worker = new Worker(workerURL, { type: "module" });
				Draw.worker.onmessage = message => {
					const data = message.data;
					/** @type {Record<any, any>} */(clientCommands)[data.shift()](...data);
				};

				// Inject our own canvas implementation
				/** @type {HTMLCanvasElement?} */
				let oldCanvas = null;
				oldCanvas = Bindings.ig.system.canvas;
				Draw.canvas = document.createElement("canvas");
				Draw.canvas.id = oldCanvas.id;
				Draw.canvas.style.cssText = oldCanvas.style.cssText;
				Draw.canvas.width = oldCanvas.width;
				Draw.canvas.height = oldCanvas.height;
				oldCanvas.parentNode?.insertBefore(Draw.canvas, oldCanvas);
				oldCanvas.parentNode?.removeChild(oldCanvas);
				oldCanvas = null;
				Bindings.ig.system.canvas = Draw.canvas;
				Bindings.ig.system.context = /** @type {any} */(new DrawContext());

				/** @type {HTMLCanvasElement} */
				const offscreenCanvas = /** @type {any} */(Draw.canvas)
					.transferControlToOffscreen();
				Draw.send(
					"initialize",
					[/** @type {any} */(offscreenCanvas)],
					offscreenCanvas,
					Atlas.sizeMagnitude
				);
			});
	}

	/**
	 * @param {number} x1
	 * @param {number} y1
	 * @param {number} x2
	 * @param {number} y2
	 * @param {number} deltaX 
	 * @param {number} deltaY 
	 * @param {number} u1 
	 * @param {number} v1 
	 * @param {number} u2 
	 * @param {number} v2 
	 * @param {Color.RGBA} color
	 */
	static rectangle(x1, y1, x2, y2, deltaX, deltaY, u1, v1, u2, v2, color) {
		if (Draw.geometryBuffer.buffer.byteLength === 0) { return; }

		// Triangle 1
		Draw.vertex(x1, y1, deltaX, deltaY, u1, v2, color);
		Draw.vertex(x1, y2, deltaX, deltaY, u1, v1, color);
		Draw.vertex(x2, y1, deltaX, deltaY, u2, v2, color);

		// Triangle 2
		Draw.vertex(x1, y2, deltaX, deltaY, u1, v1, color);
		Draw.vertex(x2, y2, deltaX, deltaY, u2, v1, color);
		Draw.vertex(x2, y1, deltaX, deltaY, u2, v2, color);

		Draw.vertexCount += 6;
	}

	/**
	 * Writes a vertex to the vertex buffer.
	 * @private
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} deltaX 
	 * @param {number} deltaY 
	 * @param {number} u 
	 * @param {number} v 
	 * @param {Color.RGBA} color
	 */
	static vertex(x, y, deltaX, deltaY, u, v, color) {
		let index = Draw.geometryIndex;
		const endian = Draw.isLittleEndian;
		const buffer = Draw.geometryBuffer;
		buffer.setFloat32(index, x, endian); index += 4;
		buffer.setFloat32(index, y, endian); index += 4;
		buffer.setFloat32(index, deltaX, endian); index += 4;
		buffer.setFloat32(index, deltaY, endian); index += 4;
		buffer.setInt16(index, u, endian); index += 2;
		buffer.setInt16(index, v, endian); index += 2;
		buffer.setUint8(index++, color[0]);
		buffer.setUint8(index++, color[1]);
		buffer.setUint8(index++, color[2]);
		buffer.setUint8(index++, color[3]);
		Draw.geometryIndex = index;
	}

	/**
	 * Finalizes geometry and sends it and interpolation data to WebGL.
	 * @param {number} startTime The interpolation start time for this batch of geometry.
	 * @param {number} millisecondsToInterpolation A factor that converts milliseconds after the
	 * start time into an interpolation value from 0 to 1, where 0 represents the start and 1
	 * represents the destination. Values outside of this range are valid and represent
	 * extrapolation from the start or destination.
	 */
	static finalize(startTime, millisecondsToInterpolation) {
		const buffer = Draw.geometryBuffer.buffer;
		if (buffer.byteLength > 0) {
			Draw.send(
				"loadGeometry",
				[buffer],
				buffer,
				Math.min(Draw.geometryIndex, Draw.geometryBuffer.byteLength),
				Draw.vertexCount,
				startTime,
				millisecondsToInterpolation
			);
		}
		Draw.geometryIndex = 0;
		Draw.vertexCount = 0;
	}

	/**
	 * @private
	 * @template {keyof WorkerCommands} T
	 * @param {T} command 
	 * @param {Transferable[] | null} transfer 
	 * @param {Parameters<WorkerCommands[T]>} args 
	 */
	static send(command, transfer, ...args) {
		if (Draw.worker) {
			if (transfer) {
				Draw.worker.postMessage([command, ...args], transfer);
			} else {
				Draw.worker.postMessage([command, ...args]);
			}
		} else {
			throw new Error("Worker not yet initialized");
		}
	}

	/**
	 * Uploads pixel data to the texture at the given coordinates. The backing buffer is 
	 * transferred to the worker, so the `pixels` will no longer be usable after calling
	 * this function.
	 * @param {ImageData} pixels 
	 * @param {number} x 
	 * @param {number} y 
	 */
	static uploadToAtlas(pixels, x, y) {
		Draw.send(
			"uploadToAtlas",
			[pixels.data.buffer],
			pixels.data.buffer,
			pixels.width,
			pixels.height,
			x,
			y
		);
	}

	static updateScreenTransform() {
		if (Draw.canvas) {
			Draw.xToScreenX = 2 / Draw.canvas.width;
			Draw.yToScreenY = -2 / Draw.canvas.height;
			Draw.xOffset = Draw.canvas.width * -0.5;
			Draw.yOffset = Draw.canvas.height * -0.5;
		}
	}

	/** @private @readonly */
	static maxVertices = 2048 * 4;

	/** @private @readonly */
	static vertexBufferSize =
		24 * // Bytes per vertex
		3 * // Vertices per triangle
		2 * // Triangles per quad
		Draw.maxVertices;

	/** @private */
	static geometryBuffer = new DataView(new ArrayBuffer(Draw.vertexBufferSize));

	/** @private */
	static geometryIndex = 0;

	/** @private */
	static vertexCount = 0;

	/** @private @readonly */
	static isLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

	/** @type {Worker?} */
	static worker = null;

	/** @type {HTMLCanvasElement?} */
	static canvas = null;

	static xToScreenX = 0;
	static yToScreenY = 0;
	static xOffset = 0;
	static yOffset = 0;
}