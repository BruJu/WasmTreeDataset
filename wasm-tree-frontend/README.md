# Wasm Tree

This package is an implementation of RDF.JS Dataset and RDF.JS Store that
resorts to Web Assembly to store the quads in the form of several BTrees of
numbers (`unsigned int` on 32 bits).

Correspondance between numbers and actual terms is done in Javascript.


## Quick example in Node.js

```javascript
// Import wasmtree
const wasmtree = require('@bruju/wasm-tree');

// Import other rdf libraries as wasm tree doesn't provide any RDF.JS data model
const rdf = require('@graphy/core.data.factory');
const namespace = require('@rdfjs/namespace');
const ex = namespace('http://example.org/', rdf);

// Populate a dataset
let dataset = new wasmtree.Dataset();
dataset.add(rdf.quad(ex.subject, ex.predicate, ex.object));
dataset.add(rdf.quad(ex.subject, ex.predicate, ex.otherobject));
dataset.add(rdf.quad(ex.other  , ex.predicate, ex.object));

// Count number of quads with the object ex.object
const occObjectInObject = dataset.match(null, null, ex.object).size;
console.log(occObjectInObject + " quads have " + ex.object.value + " in object position");

// Free the Web Assembly linear memory
dataset.free();
```

You can run this example by writing the code in a file named `example.js` and then run :

```
$ npm install @bruju/wasm-tree @graphy/core.data.factory @rdfjs/namespace
$ node example.js
2 quads have http://example.org/object in object position
```

## How to instanciate a dataset or a store

```javascript
const wasmtree = require('@bruju/wasm-tree');

let dataset = new wasmtree.Dataset();
let store = new wasmtree.Store();
```

## Dataset

The DatasetCore and most Dataset features from RDF.JS are implemented

https://rdf.js.org/dataset-spec/

We currently do not implement `import`, `toStream`, `toString` and `toCanonical`.

Also note that the equals function does not normalize the black node as specified.


## Store

The Store interface from RDF.JS is fully implemented

http://rdf.js.org/stream-spec/

`add(quad: RDF.Quad): void` and `addQuad(quad: RDF.Quad): void` are also provided to help synchronously populate the store.

You can also use the storeStream function
`const myStore = wasmtree.storeStream(aStreamOfQuads);` which has a similar behaviour as [the npm package RDF Store Stream](https://www.npmjs.com/package/rdf-store-stream).

## About memory

As Web Assembly doesn't provide a garbage collector, the dataset and the store
will keep memory until it is explicitely freed.


```javascript
const wasmtree = require('@bruju/wasm-tree');

let dataset = new wasmtree.Dataset();
let store = new wasmtree.Store();

// Do some interesting work

dataset.free();
store.free();
```

The free function will deallocate the memory, and empty the structures. If a
freed variable is reused, it will allocate again some web assembly memory.

Note that some dataset built from other dataset calls do not necessarily have
to be freed (but still can). For example, `dataset.match()` will not allocate
memory from web assembly until a complex operation like adding a quad is
required (looping on the dataset does not trigger the allocation process).


## License

Licensied under the MIT License

This has been funded by the [REPID Project](https://projet.liris.cnrs.fr/repid/index.html).
