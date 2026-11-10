(globalThis as any).location = { protocol: "http:", host: "x" }; (globalThis as any).WebSocket = class { addEventListener() {} };
