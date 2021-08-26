const assert = require('assert')
const namespace = require('@rdfjs/namespace')

const streamifyArray = require('streamify-array')

function runTests (rdf, StoreClass) {
  const ex = namespace('http://example.org/', rdf)

  const quad1110 = rdf.quad(ex.s1, ex.p, ex.o1);
  const quad1120 = rdf.quad(ex.s1, ex.p, ex.o2);
  const quad1111 = rdf.quad(ex.s1, ex.p, ex.o1, ex.g1);
  const quad1112 = rdf.quad(ex.s1, ex.p, ex.o1, ex.g2);
  const quad2120 = rdf.quad(ex.s2, ex.p, ex.o2);
  const quad3120 = rdf.quad(ex.s3, ex.p, ex.o2);

  function getArrayOfQuads() {
    return [
      quad1110,
      quad1120,
      quad1111,
      quad1112,
      quad2120,
      quad3120
    ];
  }

  function getAStreamOfQuads() {
    return streamifyArray(getArrayOfQuads());
  }

  function checkEquals(obtainedQuad, expectedQuads) {
    if (obtainedQuad.length != expectedQuads.length)
      return false;
    
    let isPresent = quad => {
      for (let j = 0 ; j != expectedQuads.length ; ++j) {
        if (quad.equals(expectedQuads[j]))
          return true;
      }
      return false;
    };

    for (let i = 0 ; i != obtainedQuad.length ; ++i) {
      if (!isPresent(quad)) {
        return false;
      }
    }

    return true;
  }

  function checkMatch(store, expectedQuads) {
    let arry = [];
    let m = store.match().on('end', () => {
      m.on('data', data => { arry.push(data); })
      m.on('end', () => {
        console.log(arry);
        console.log(expectedQuads);
        assert(checkEquals(arry, expectedQuads));
      })
    })
  }

  describe("theStoreJSTests", () => {
    it('should work with a stream of 5', () => {
      const sourceArray = [
        rdf.quad(ex.s1, ex.p1, ex.o1),
        rdf.quad(ex.s1, ex.p1, ex.o2),
        rdf.quad(ex.s1, ex.p1, ex.o3),
        rdf.quad(ex.s1, ex.p1, ex.o4),
        rdf.quad(ex.s1, ex.p1, ex.o5)
      ]

      sourceStream = streamifyArray(sourceArray)

      let c = 0;
      sourceStream.on('data', _ => { c = c + 1; })
                  .on('end', () => { assert(c == 5);  })
    })
  })


  describe("Match", () => {
    it("Does not trigger the data event on an empty store", () => {
      const store = new StoreClass();
      store.match()
        .on('data' , () => { assert(false); })
        .on('error', () => { assert(false); })
        .on('end'  , () => { assert(true) ; })
    })
  })

  describe("Import and Match", () => {
    it("Works when the dataset is not modified", () => {
      const store = new StoreClass();
      store.import(getAStreamOfQuads())
      checkMatch(store, getArrayOfQuads())
    })
  })

  describe("countQuads", () => {
    it("should return 0 on empty stores", () => {
      const store = new StoreClass();
      assert(store.countQuads() == 0);
    })

    it("should count the number of matching quads", () => {
      const store = new StoreClass();
      store.import(getAStreamOfQuads())
        .on('end', () => {
          assert(store.countQuads(null, null, ex.o2), 3);
          assert(store.countQuads(null, ex.p), 6);
          assert(store.countQuads(), 6);
        })

      assert(store.countQuads() == 0);
    })

  })
}



module.exports = runTests
