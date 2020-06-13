# Wasm Tree Dataset & Store

My repository https://github.com/BruJu/Portable-Reasoning-in-Web-Assembly tries
to exports Sophia Dataset : it is slow.

One of the suspect were the strings so my advisor told me "what if you only
export your tree structure from wasm, and do the string - index corresponding
in Javascript ?" (+ There are other reason like exporting everything causes
major memory leaks because Javascript does not have destructor)

This repository is :
- A BTreeDataset written in Rust that uses numbers (`src/btreeddataset.rs`)
- A Javascript Wrapper class that tries to be RDF.JS.org compliant (`pkg/wrappedtree.js`)


## Getting Started

NodeJS :

- `npm install @graphy/core.data.factory` (we rely on Graphy's terms and concise method)

- `wasm-pack build`
- Keep the `rust_tree*` files and the `wrappedtree.js` file
- Import : `let wt = require (./wrappedtree.js);`

- Use our dataset : `let dataset = new wt.TreeDataset();` which implements https://rdf.js.org/dataset-spec/#datasetcore-interface
- Use `dataset.free()` to free wasm linear memory

- Use our store : `let store = new wt.TreeStore();` which implements http://rdf.js.org/stream-spec/#store-interface
- Use `store.free()` to free wasm linear memory


## Tests

- Run `./mocha` (`npm install mocha -g` if needed)

## TODO

- `./pkg/package.json` is wrong, fix it (wasm-pack should understand we have an extra layer of js)
- Lazily initialize the matched datasets
- Finish the Dataset (partial) implementation
- Use `wasm-pack test` instead of `mocha`

## Benchmarks

The presented bench have been run on my computer (Dell Inspiron 15 5000 with a Intel(R) Core(TM) i5-1035G1 CPU), on nodejs / native rust.

For the tested `.match` function calls, we are always faster than [Graphy](https://graphy.link/) and [sophia_wasm](https://github.com/BruJu/Portable-Reasoning-in-Web-Assembly/tree/master/sophia-wasm) and we are sometimes faster than Sophia itself.

[Benchmark's plot can be found here](benchmark/plots.ipynb)

[The benchmark infrastructure can be found here](https://github.com/BruJu/wasm_rdf_benchmark)

## License

MIT License
