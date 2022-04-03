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
					/**
					 * 
					 * @param {string} root 
					 */
					func: root => {
						/** @type {any} */(window).plentylandRoot = root;
						const script = document.createElement("script");
						script.type = "module";
						script.src = String(new URL("a.js", root));
						document.head.appendChild(script);
					},
					args: [api.runtime.getURL("/")],
					world: "MAIN"
				});
			}
		);
	});