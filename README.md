# Wasm Tree Dataset & Store

An implementation of RDF.JS Dataset and Store that partly resorts to Web
Assembly.

Check [wasm-tree-frontend/README.md](wasm-tree-frontend/README.md) for proper
documentation about "how to use ?"

## Context

My repository https://github.com/BruJu/Portable-Reasoning-in-Web-Assembly tries
to exports Sophia Dataset : it is slow.

One of the suspect were the strings so my advisor told me "what if you only
export your tree structure from wasm, and do the string - index corresponding
in Javascript ?" (+ There are other reason like exporting everything causes
major memory leaks because Javascript does not have destructor)

This repository is :

- A BTreeDataset written in Rust that uses numbers (the backend)

- A Javascript Wrapper class that tries to be RDF.JS.org compliant (the frontend)

## Usage

- Users are invited to the read the [wasm-tree-frontend](wasm-tree-frontend/README.md) documentation.


## Tests

- Run `./mocha` (`npm install mocha -g` if needed) in wasm-tree-frontend.

## TODO

- Finish the Dataset (partial) implementation

## Benchmarks

The presented bench have been run on my computer (Dell Inspiron 15 5000 with a Intel(R) Core(TM) i5-1035G1 CPU), on nodejs / native rust.

For the tested `.match` function calls, we are always faster than [Graphy](https://graphy.link/) and [sophia_wasm](https://github.com/BruJu/Portable-Reasoning-in-Web-Assembly/tree/master/sophia-wasm) and we are sometimes faster than Sophia itself.

[Benchmark's plot can be found here](benchmark/plots.ipynb)

[The benchmark infrastructure can be found here](https://github.com/BruJu/wasm_rdf_benchmark)

## License

MIT License
