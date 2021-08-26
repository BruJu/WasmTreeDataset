const assert = require('assert')
const namespace = require('@rdfjs/namespace')

let wasmTreeMain = require('../index')
let wasmTreeAlt  = require('../lib/alternative')

function runTests (rdf) {
  const ex = namespace('http://example.org/', rdf)

  describe('Alternatives', () => {
    function share(klass, name) {
      describe(name, () => {
        it('should share termidmap', () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);

          assert.strictEqual(dataset.termIdMap.identifiersToTerms.length, 5);
          assert.strictEqual(copy.termIdMap.identifiersToTerms.length, 5);

          const filtered = dataset.match(null, null, ex.object1)
          assert.strictEqual(filtered.termIdMap.identifiersToTerms.length, 5)
        })
      })
    }

    function donotshare(klass, name) {
      describe(name, () => {
        it('should not share termidmap', () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);
          
          assert.strictEqual(dataset.termIdMap.identifiersToTerms.length, 5);
          assert.strictEqual(copy.termIdMap.identifiersToTerms.length, 4);

          const filtered = dataset.match(null, null, ex.object1)
          assert.strictEqual(filtered.termIdMap.identifiersToTerms.length, 4)
        })
      })
    }

    function builtWithIdentifierList(name, isTrue, klass) {
      describe(name, () => {
        it('should ' + (isTrue ? "" : "not") + " be built with identifierList", () => {
          const dataset = new klass();
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          dataset.add(quad1);

          const copy = dataset.match();
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          dataset.add(quad2);
          
          assert.strictEqual(isTrue, copy.identifierList != undefined)
        })
      })
    }

    donotshare(wasmTreeAlt.DatasetWithIdentifierList, "wasm_tree_II");
    donotshare(wasmTreeMain.AlwaysForestDataset, "wasm_tree_FI");
    share(wasmTreeMain.Dataset, "wasm_tree_IS");
    share(wasmTreeAlt.DatasetWithSharedTermIdMap, "wasm_tree_FS");

    builtWithIdentifierList("wasm_tree_II", true , wasmTreeAlt.DatasetWithIdentifierList)
    builtWithIdentifierList("wasm_tree_IS", true , wasmTreeMain.Dataset)
    builtWithIdentifierList("wasm_tree_FI", false, wasmTreeMain.AlwaysForestDataset)
    builtWithIdentifierList("wasm_tree_FS", false, wasmTreeAlt.DatasetWithSharedTermIdMap)
  })
}

module.exports = runTests
