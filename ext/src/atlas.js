import { Bindings } from "./bindings.js";
import { Interpolation } from "./interpolation.js";
import { Draw } from "./draw.js";

/**
 * The atlas is used to reserve space in the main texture.
 */
export class Atlas {
	/**
	 * A child of an `AtlasNode` which represents a quadrant in the node.
	 * - `AtlasNode` indicates the quadrant is subdivided into sub-quadrants as specified by
	 * the node's children.
	 * - `AtlasReservation` represents a reservation that currently occupies the quadrant.
	 * - `null` indicates the quadrant is empty and available to be reserved.
	 * @typedef {AtlasNode | AtlasReservation | null} AtlasChild
	 */

	/**
	 * A reserved space in the atlas. Its 4 elements represent the 4 quadrants of its space.
	 * @typedef {[AtlasChild, AtlasChild, AtlasChild, AtlasChild]} AtlasNode
	 */

	/**
	 * Returns the specific reservation for the given subsection of the `image`.
	 * @param {HTMLCanvasElement & {pl_reservation?: Map<number, AtlasReservation>}} image 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} width 
	 * @param {number} height 
	 */
	static getReservation(image, x, y, width, height) {
		let map = image.pl_reservation;
		if (map === undefined) {
			map = image.pl_reservation = new Map();
		}
		const hashRange = 1 << 12;
		const allocationHash = (
			(x * hashRange + y) * hashRange + width
		) * hashRange + height;
		let reservation = map.get(allocationHash);
		if (reservation === undefined) {
			reservation = new AtlasReservation;
			map.set(allocationHash, reservation);
		}
		return reservation;
	}

	/**
	 * Reserves a space in the atlas that can accomodate the given width and height.
	 * If there is no available space, the least recently drawn reservations are deallocated to
	 * make space for the given reservation.
	 * @param {AtlasReservation} reservation 
	 * @param {number} width
	 * @param {number} height
	 * @returns {boolean} `true` if the allocation succeded. If `false`, allocation did not
	 * succeed and thus the space pointed to by the allocation should not be used.
	 */
	static allocate(reservation, width, height) {
		const targetLevel = Math.ceil(Math.log2(Math.max(width, height))) | 0;
		if (1 << targetLevel < width || 1 << targetLevel < height) {
			throw new Error("Wrong target level " + targetLevel + "for " + width + "x" + height);
		}

		// These variables keep track of the current candidate node to insert the allocation
		// into. The best candidate is an empty location. If no location is available, the best
		// candidate is the node that was least recently drawn.

		/** @type {AtlasNode?} */
		let candidateNode = null;
		let candidateIndex = 0;
		let candidateLevel = 0;
		let candidateX = 0;
		let candidateY = 0;
		let candidateAge = Number.MAX_SAFE_INTEGER;

		/**
		 * Recursively traverses the node, attemping to find a candidate space to allocate into.
		 * @param {AtlasNode} node 
		 * @param {number} level 
		 * @param {number} x 
		 * @param {number} y 
		 * @returns {number} The most recent tick the node's children have been drawn.
		 */
		function traverseNode(node, level, x, y) {
			let drawTime = 0;
			for (let index = 0; index < node.length; index++) {
				const subNode = node[index];
				/** @type {number} */
				let subDrawTime;

				// Use bit arithmetic to convert the child index into the assocaited
				// quadrant coordinates.
				const newX = x + ((index & 1) << level);
				const newY = y + ((index >> 1) << level);

				if (subNode) {
					if (subNode instanceof Array) {
						// Node is a sub-node, so traverse it.
						subDrawTime = traverseNode(subNode, level - 1, newX, newY);
					} else {
						// Node is a reservation, so record its last draw time.
						subDrawTime = subNode.lastDrawn;
					}
				} else {
					// Node is empty
					subDrawTime = 0;
					if (level > targetLevel) {
						// The node is too big, so split it into smaller nodes.

						/** @type {AtlasNode} */
						const newNode = [null, null, null, null];
						node[index] = newNode;

						// Traverse the subdivided node to either find the first empty space,
						// or subdivide it even more.
						subDrawTime = traverseNode(newNode, level - 1, newX, newY);
						if (subDrawTime !== 0) {
							throw new Error("Newly created node has lastDrawn other than 0.");
						}
						return subDrawTime;
					}
				}
				if (level >= targetLevel && subDrawTime < candidateAge) {
					// This child is a compatible size and has been drawn later than the current
					// candidate, so replace the current candidate with this node.
					candidateX = newX;
					candidateY = newY;
					candidateAge = subDrawTime;
					candidateLevel = level;
					candidateNode = node;
					candidateIndex = index;
					if (subDrawTime === 0) {
						// This child is empty, so we aren't going to find a better candidate.
						// Return early to save computation.
						return subDrawTime;
					}
				}
				drawTime = Math.max(drawTime, subDrawTime);
			}
			return drawTime;
		}
		// Find a candidate that can fit the given size
		traverseNode(Atlas.root, Atlas.sizeMagnitude - 1, 0, 0);

		if (candidateNode && candidateLevel !== targetLevel) {
			// The found candidate is larger than the given size

			// First, we deallocate the candidate
			Atlas.deallocate(candidateNode[candidateIndex]);
				/** @type {AtlasNode} */(candidateNode)[candidateIndex] = null;

			// Then replace the candidate with an empty node
			candidateNode = null;

			// Finally, split the candidate into nodes that best fit the given size.
			candidateAge = Number.MAX_SAFE_INTEGER;
			traverseNode(Atlas.root, Atlas.sizeMagnitude - 1, 0, 0);
			if (candidateNode === null) {
				throw new Error("No candidate found despite splitting a larger one.");
			}
		}
		if (candidateNode && candidateAge !== Interpolation.currentTick) {
			// A candidate was found, so set the given reservation to allocated and deallocate
			// the candidate.
			reservation.x = candidateX;
			reservation.y = candidateY;
			reservation.allocated = true;
			Atlas.deallocate(candidateNode[candidateIndex]);
				/** @type {AtlasNode} */(candidateNode)[candidateIndex] = reservation;
			Atlas.count++;
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Marks the child and all of its descendants as deallocated. After deallocation, the space
	 * it occupied may be used by other `AtlasChild`s.
	 * @param {AtlasChild | undefined} child 
	 */
	static deallocate(child) {
		if (child) {
			if (child instanceof Array) {
				for (const childChild of child) {
					Atlas.deallocate(childChild);
				}
			} else {
				child.allocated = false;
				child.x = -1;
				child.y = -1;
				Atlas.count--;
				Bindings.console.log(
					"Deallocated at " +
					child.x +
					", " +
					child.y +
					" last drawn " +
					(Interpolation.currentTick - child.lastDrawn) +
					" atlas count " +
					Atlas.count
				);
			}
		}
	}

	/**
	 * @private
	 * The number of `Allocation`s currently allocated in the atlas.
	 */
	static count = 0;

	/**
	 * The root node of the atlas, which divides the whole texture into 4 equally sized quadrants.
	 * @private
	 * @readonly
	 * @type {AtlasNode}
	 */
	static root = [null, null, null, null];

	/**
	 * The exponent of the size of the texture. In other words, the x in size = 2^x
	 * @readonly
	 */
	static sizeMagnitude = 11;
}

/**
 * Represents an allocation in the atlas.
 */
class AtlasReservation {
	allocated = false;
	lastDrawn = 0;
	x = -1;
	y = -1;

	/**
	 * Ensures that this reservation is in the atlas, allocating and uploading the image to the
	 * main texture if necessary.
	 * @param {HTMLCanvasElement} image 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} width 
	 * @param {number} height 
	 * @returns {boolean} `true` if the reservation succeeded and the image may be drawn.
	 */
	reserve(image, x, y, width, height) {
		if (!this.allocated) {
			if (this.lastDrawn >= Interpolation.currentTick) {
				// We're in cooldown from a failed allocation.
				return false;
			}
			const context = image.getContext("2d");
			if (!context) { throw new Error("Unable to create context") }
			if (!Atlas.allocate(this, width, height)) {
				Bindings.console.warn(`Unable to allocate ${width}x${height} image`);
				// Set this reservation on cool down to limit thrashing of the algorithm
				this.lastDrawn = Interpolation.currentTick;
				return false;
			}
			const pixels = context.getImageData(x, y, width, height);
			Bindings.console.log(
				`Loaded a ${pixels.width}x${pixels.height} image at (${this.x}, ${this.y})`
			);
			Draw.uploadToAtlas(pixels, this.x, this.y);
		}
		this.lastDrawn = Interpolation.currentTick;
		return true;
	}
}