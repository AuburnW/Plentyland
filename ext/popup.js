// @ts-expect-error
const api = (self.chrome || browser);
/** @type {HTMLAnchorElement} */ (document.getElementById("start"))
	.addEventListener("click", () => {
		api.tabs.query({
			active: true,
			currentWindow: true
		}).then(
			/** @param {any} tab */
			([tab]) => {
				api.scripting.executeScript({
					target: { tabId: tab.id },
					func: root => {
						/** @type {any} */(window).plentylandRoot = root;
					},
					args: [api.runtime.getURL("/")],
					world: "MAIN"
				});
				api.scripting.executeScript({
					target: { tabId: tab.id },
					files: ["a.js"],
					world: "MAIN"
				})
			}
		);
	});