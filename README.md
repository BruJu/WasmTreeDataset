# Wasm Tree Dataset & Store

An implementation of RDF.JS Dataset and Store that partly resorts to Web
Assembly.

Check [wasm-tree-frontend/README.md](wasm-tree-frontend/README.md) for proper
documentation about "how to use?"

## Context

This repository is :

- A BTreeDataset written in Rust that uses numbers (the backend)

- A Javascript Wrapper class that is [RDF/JS](https://rdf.js.og) compliant (the frontend)

## Getting Started / Usage

- Users are invited to the read the [wasm-tree-frontend](wasm-tree-frontend/README.md) documentation.


## Tests

- Run `./mocha` (`npm install mocha -g` if needed) in wasm-tree-frontend.

### Testing the backend

Tests are only done in Javascript from the front end. To test frontend modification you need to:

- Modify `wasm-tree-frontend` dependencies to use the local `wasm-tree-backend`:
    - in `package.json` use this dependency `"@bruju/wasm-tree-backend": "../wasm-tree-backend/pkg",` in place of the current one.
- Build the backend
    - `cd wasm-tree-backend`
    - `./buildpkg.py`
- Go in the frontend
    - `cd ../wasm-tree-frontend`
    - `npm install`
    - `mocha`

## Build

[Rust](https://www.rust-lang.org/tools/install) and [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) are needed.

*Compile and package the frontend:*

- `cd wasm-tree-backend/`
- `./buildpkg.py`
- `cd pkg`
- `wasm-pack pack`
- `cd ../../`

*Package the backend:*

- `cd wasm-tree-frontend`
- `npm pack`

## Benchmarks

The presented bench have been run on my computer (Dell Inspiron 15 5000 with a Intel(R) Core(TM) i5-1035G1 CPU), on nodejs / native rust.

For the tested `.match` function calls, we are always faster than [Graphy](https://graphy.link/) and [sophia_wasm](https://github.com/BruJu/wasmify-sophia/tree/master/sophia-wasm) and we are sometimes faster than Sophia itself.

[Benchmarks can be found here](https://github.com/BruJu/RustWasmRDFNotes)

[The benchmark infrastructure can be found here](https://github.com/BruJu/wasm_rdf_benchmark)

## License

MIT License
