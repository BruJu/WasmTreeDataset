# Wasm Tree Dataset

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
- Use our dataset : `let dataset = new wt.WrappedDataset();` which implements https://rdf.js.org/dataset-spec/#datasetcore-interface
- Use `dataset.free()` to free wasm linear memory

## Tests

- Run `./mocha` (`npm install mocha -g` if needed)

## TODO

- `./pkg/package.json` is wrong, fix it (wasm-pack should understand we have an extra layer of js)
- Lazily initialize the matched datasets
- Use `wasm-pack test` instead of `mocha`

## Benchmarks

TODO

## Licence

TODO
