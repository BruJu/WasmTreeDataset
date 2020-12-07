const assert = require('assert')
const namespace = require('@rdfjs/namespace')

let wasmTreeMain = require('../index.js')
let wasmTreeAlt  = require('../alternative.js')

function runTests (rdf) {
  const ex = namespace('http://example.org/', rdf)

  describe('Alternatives', () => {
    function share(klass, name) {
      describe(name, () => {
        it('should share indexers', () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);

          assert.strictEqual(dataset.indexer.indexToTerms.length, 5);
          assert.strictEqual(copy.indexer.indexToTerms.length, 5);

          const filtered = dataset.match(null, null, ex.object1)
          assert.strictEqual(filtered.indexer.indexToTerms.length, 5)
        })
      })
    }

    function donotshare(klass, name) {
      describe(name, () => {
        it('should not share indexers', () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);
          
          assert.strictEqual(dataset.indexer.indexToTerms.length, 5);
          assert.strictEqual(copy.indexer.indexToTerms.length, 4);

          const filtered = dataset.match(null, null, ex.object1)
          assert.strictEqual(filtered.indexer.indexToTerms.length, 4)
        })
      })
    }

    function builtWithIndexList(name, isTrue, klass) {
      describe(name, () => {
        it('should ' + (isTrue ? "" : "not") + " be built with indexList", () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);
          
          assert.strictEqual(isTrue, copy.indexList != undefined)
        })
      })
    }

    donotshare(wasmTreeAlt.DatasetWithIndexListNoSharedIndexer, "wasm_tree_II");
    donotshare(wasmTreeMain.AlwaysForestDataset, "wasm_tree_FI");
    share(wasmTreeMain.Dataset, "wasm_tree_IS");
    share(wasmTreeAlt.DatasetWithSharedIndexerNoIndexList, "wasm_tree_FS");

    builtWithIndexList("wasm_tree_II", true , wasmTreeAlt.DatasetWithIndexListNoSharedIndexer)
    builtWithIndexList("wasm_tree_IS", true , wasmTreeMain.Dataset)
    builtWithIndexList("wasm_tree_FI", false, wasmTreeMain.AlwaysForestDataset)
    builtWithIndexList("wasm_tree_FS", false, wasmTreeAlt.DatasetWithSharedIndexerNoIndexList)
  })
}

module.exports = runTests
