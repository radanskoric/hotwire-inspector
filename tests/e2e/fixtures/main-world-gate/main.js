export function startGate(document, Runtime) {
  const runtime = new Runtime(document, [
    () => ({
      start() {},
      stop() {},
      operations: {
        fixtureRead: {
          handle: () => ({
            success: true,
            value: window.mainWorldFixture.value,
          }),
          validate: (value) =>
            value?.success === true && value.value === "page-owned-value"
              ? { success: true, value: value.value }
              : null,
        },
      },
    }),
  ]);
  if (location.search.includes("client-first")) {
    document.addEventListener("gate:start", () => runtime.start(), {
      once: true,
    });
  } else {
    runtime.start();
  }
}
