/* global describe, it */

const assert = require('assert')
const namespace = require('@rdfjs/namespace')

function runTests (rdf, DatasetClass) {
  const ex = namespace('http://example.org/', rdf)


function makeWrapperDataset(l) {
	let dataset = new DatasetClass();
	
	if (l != undefined) {
		for (let q of l) {
			dataset.add(q);
		}
	}
	return dataset;
}

  describe('Dataset', () => {
    describe('addAll', () => {
        it('should be a function', () => {
          const dataset = makeWrapperDataset()
  
          assert.strictEqual(typeof dataset.addAll, 'function')
        })
  
        it('should add the given sequence', () => {
          const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
          const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
          const quad3 = rdf.quad(ex.subject, ex.predicate, ex.object3)
          const quad4 = rdf.quad(ex.subject, ex.predicate, ex.object4)

          const dst = makeWrapperDataset()

          // Array
          dst.addAll([quad1, quad2])
          assert(dst.has(quad1))
          assert(dst.has(quad2))
          // Set
          dst.addAll(new Set([quad3, quad4]))
          assert(dst.has(quad1))
          assert(dst.has(quad2))
          assert(dst.has(quad3))
          assert(dst.has(quad4))
        })
  
        it('should add the given dataset', () => {
            const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
            const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
            const quad3 = rdf.quad(ex.subject, ex.predicate, ex.object3)
  
            const dst = makeWrapperDataset([quad1])
            const src = makeWrapperDataset([quad2, quad3])

            dst.addAll(src)
            assert(dst.has(quad1))
            assert(dst.has(quad2))
            assert(dst.has(quad3))
          })

  
        it('should add the given dataset', () => {
            const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
            const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
            const quad3 = rdf.quad(ex.subject, ex.predicate, ex.object3)
  
            const dst = makeWrapperDataset([quad1])
            const src = makeWrapperDataset([quad2, quad3])

            dst.addAll(src)
            assert(dst.has(quad1))
            assert(dst.has(quad2))
            assert(dst.has(quad3))
          })

        /*
        it('should not add duplicate Quads', () => {
          const quadA = rdf.quad(ex.subject, ex.predicate, ex.object)
          const quadB = rdf.quad(ex.subject, ex.predicate, ex.object)
          const dataset = makeWrapperDataset()
  
          dataset.add(quadA)
          dataset.add(quadB)
  
          assert.strictEqual(dataset.size, 1)
        })
        */
      })
    })

    describe('contains', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.contains, 'function')
      })

      it('should contains itself', () => {
        const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
        const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)

        const dst = makeWrapperDataset([quad1, quad2])
        const other_graph = makeWrapperDataset([quad1, quad2])

        assert(dst.contains(other_graph));
        assert(dst.contains(dst));
      })

      it('should contain an empty graph', () => {
        const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
        const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)

        const dst = makeWrapperDataset([quad1, quad2])
        const an_empty_graph = makeWrapperDataset();

        assert(dst.contains(an_empty_graph));
        assert(!an_empty_graph.contains(dst));
      })

      it('should contain small graph', () => {
        const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
        const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)

        const big = makeWrapperDataset([quad1, quad2])
        const small = makeWrapperDataset([quad1])

        assert(big.contains(small));
        assert(!small.contains(big));
      })

      it('should not contain a graph that a differente lement', () => {
        const quad1 = rdf.quad(ex.subject, ex.predicate, ex.object1)
        const quad2 = rdf.quad(ex.subject, ex.predicate, ex.object2)
        const quad3 = rdf.quad(ex.subject, ex.predicate, ex.object3)

        const graph12 = makeWrapperDataset([quad1, quad2])
        const graph13 = makeWrapperDataset([quad1, quad3])

        assert(!graph12.contains(graph13));
      })
    })


    describe('deleteMatches', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.deleteMatches, 'function')
      })

      it('delete all by default', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad21 = rdf.quad(ex.subject2, ex.predicate, ex.object1)

        const graph = makeWrapperDataset([quad11, quad12, quad13, quad21])

        assert.strictEqual(graph.size, 4)
        graph.deleteMatches()
        assert.strictEqual(graph.size, 0)
      })

      it('delete all if removing a shared predicate', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad21 = rdf.quad(ex.subject2, ex.predicate, ex.object1)

        const graph = makeWrapperDataset([quad11, quad12, quad13, quad21])

        assert.strictEqual(graph.size, 4)
        graph.deleteMatches(undefined, ex.predicate, undefined, undefined)
        assert.strictEqual(graph.size, 0)
      })

      it('delete only matching term', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad21 = rdf.quad(ex.subject2, ex.predicate, ex.object1)

        const graph = makeWrapperDataset([quad11, quad12, quad13, quad21])

        assert.strictEqual(graph.size, 4)
        graph.deleteMatches(ex.subject1)
        assert.strictEqual(graph.size, 1)
        assert(graph.has(quad21))
      })

      it('delete only matching term (bis)', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad21 = rdf.quad(ex.subject2, ex.predicate, ex.object1)

        const graph = makeWrapperDataset([quad11, quad12, quad13, quad21])

        assert.strictEqual(graph.size, 4)
        graph.deleteMatches(undefined, undefined, ex.object1)
        assert.strictEqual(graph.size, 2)
        assert(graph.has(quad12))
        assert(graph.has(quad13))
      })

      it('work properly with default graph', () => {
        const in_default = rdf.quad(ex.subject1, ex.predicate, ex.object1, rdf.defaultGraph())
        const in_other = rdf.quad(ex.subject1, ex.predicate, ex.object1, ex.other)

        const graph = makeWrapperDataset([in_default, in_other])

        graph.deleteMatches(undefined, undefined, undefined, rdf.defaultGraph())
        assert.strictEqual(graph.size, 1)
        assert(graph.has(in_other))
      })

      it('work properly with another graph', () => {
        const in_default = rdf.quad(ex.subject1, ex.predicate, ex.object1, rdf.defaultGraph())
        const in_other = rdf.quad(ex.subject1, ex.predicate, ex.object1, ex.other)
        const in_another = rdf.quad(ex.subject1, ex.predicate, ex.object1, ex.another)

        const graph = makeWrapperDataset([in_default, in_other, in_another])

        graph.deleteMatches(undefined, undefined, undefined, ex.another)
        assert.strictEqual(graph.size, 2)
        assert(graph.has(in_default))
        assert(graph.has(in_other))
      })
    })

    describe('difference', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.difference, 'function')
      })

      it('have no effect on empty datasets', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graphSrc = makeWrapperDataset([quad11, quad12, quad13])
        const graphDst = makeWrapperDataset()

        const graphDiff = graphSrc.difference(graphDst);

        assert.strictEqual(graphDiff.size, 3);
        assert(graphDiff.has(quad11));
        assert(graphDiff.has(quad12));
        assert(graphDiff.has(quad13));
      })

      it('make an empty graph when differencing the same graph', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graphSrc = makeWrapperDataset([quad11, quad12, quad13])

        const graphDiff = graphSrc.difference(graphSrc);

        assert.strictEqual(graphDiff.size, 0);
      })

      it('differentiate two different graphes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad23 = rdf.quad(ex.subject2, ex.predicate, ex.object3)

        const graphSrc = makeWrapperDataset([quad11, quad12, quad13])
        const graphDst = makeWrapperDataset([quad11, quad23])

        const graphDiff = graphSrc.difference(graphDst);

        assert.strictEqual(graphDiff.size, 2);
        assert(graphDiff.has(quad12));
        assert(graphDiff.has(quad13));
      })
    })

    describe('equals', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.equals, 'function')
      })

      it('should be able to compare empty graphes', () => {
        const graph1 = makeWrapperDataset()
        const graph2 = makeWrapperDataset()

        assert(graph1.equals(graph2))
        assert(graph1.equals(graph1))
        assert(graph2.equals(graph1))
      })

      it('should be able to compare two identical graphs', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graph1 = makeWrapperDataset([quad11, quad12, quad13])
        const graph2 = makeWrapperDataset([quad11, quad12, quad13])

        assert(graph1.equals(graph2));
        assert(graph1.equals(graph1));
        assert(graph2.equals(graph1));
      })

      it('should be able to compare different graphes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13])
        const empty_graph = makeWrapperDataset()

        assert(!graph1.equals(graph2))
        assert(!graph2.equals(graph1))
        assert(!graph1.equals(empty_graph))
        assert(!empty_graph.equals(graph1))
      })

      it('should have a different result when two graphes become identical', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13])

        assert(!graph1.equals(graph2))
        graph2.add(quad11)
        graph2.add(quad12)
        graph1.add(quad13)
        assert(graph1.equals(graph2))
      })
    })

    describe('intersection', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.intersection, 'function')
      })

      it('should be able to intersect empty graphes', () => {
        const graph1 = makeWrapperDataset()
        const graph2 = makeWrapperDataset()

        assert.strictEqual(graph1.intersection(graph2).size, 0)
        assert.strictEqual(graph1.intersection(graph1).size, 0)
      })

      it('should not modify the intersected graphes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13])

        graph1.intersection(graph2)

        assert(graph1.equals([quad11, quad12]))
        assert(graph2.equals([quad13]))
      })

      it('should be able to intersect the same graph', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graph1 = makeWrapperDataset([quad11, quad12, quad13])
        const graph2 = makeWrapperDataset([quad11, quad12, quad13])

        const intersection11 = graph1.intersection(graph1)
        const intersection12 = graph1.intersection(graph2)

        assert.strictEqual(graph1.size, 3)
        assert(graph1.equals(intersection11))
        assert(graph1.equals(intersection12))
      })

      it('should be able to intersect two disjoint graphes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad14 = rdf.quad(ex.subject1, ex.predicate, ex.object4)

        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13, quad14])

        const intersection = graph1.intersection(graph2)

        assert.strictEqual(intersection.size, 0)
      })

      it('should be able to intersect two graphes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad14 = rdf.quad(ex.subject1, ex.predicate, ex.object4)
        const quadCommon = rdf.quad(ex.common, ex.come, ex.on)
        const quadAnotherCommon = rdf.quad(ex.anothercommon, ex.come, ex.on)

        const graph1 = makeWrapperDataset([quad11, quad12, quadCommon, quadAnotherCommon])
        const graph2 = makeWrapperDataset([quad13, quad14, quadCommon, quadAnotherCommon])

        const intersection = graph1.intersection(graph2)

        assert.strictEqual(intersection.size, 2)
        assert(intersection.equals(makeWrapperDataset([quadCommon, quadAnotherCommon])))
      })

    })

    describe('union', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.union, 'function')
      })

      it('should be able to unite empty dataset', () => {
        const graph1 = makeWrapperDataset()
        const graph2 = makeWrapperDataset()

        assert.strictEqual(graph1.union(graph2).size, 0)
        assert.strictEqual(graph1.union(graph1).size, 0)
      })

      it('should not modify the united dataset', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13])

        graph1.union(graph2)

        assert(graph1.equals([quad11, quad12]))
        assert(graph2.equals([quad13]))
      })

      it('should be able to union the same dataset', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)

        const graph1 = makeWrapperDataset([quad11, quad12, quad13])
        const graph2 = makeWrapperDataset([quad11, quad12, quad13])

        const union11 = graph1.intersection(graph1)
        const union12 = graph1.intersection(graph2)

        assert.strictEqual(graph1.size, 3)
        assert(graph1.equals(union11))
        assert(graph1.equals(union12))
      })

      it('should be able to unify two distinct datasets', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad14 = rdf.quad(ex.subject1, ex.predicate, ex.object4)

        const graph1 = makeWrapperDataset([quad11, quad12])
        const graph2 = makeWrapperDataset([quad13, quad14])

        const union = graph1.union(graph2)

        assert(union.equals(makeWrapperDataset([quad11, quad12, quad13, quad14])))
      })

      it('should be able to unify two graphes with common nodes', () => {
        const quad11 = rdf.quad(ex.subject1, ex.predicate, ex.object1)
        const quad12 = rdf.quad(ex.subject1, ex.predicate, ex.object2)
        const quad13 = rdf.quad(ex.subject1, ex.predicate, ex.object3)
        const quad14 = rdf.quad(ex.subject1, ex.predicate, ex.object4)
        const quadCommon = rdf.quad(ex.common, ex.come, ex.on)
        const quadAnotherCommon = rdf.quad(ex.anothercommon, ex.come, ex.on)

        const graph1 = makeWrapperDataset([quad11, quad12, quadCommon, quadAnotherCommon])
        const graph2 = makeWrapperDataset([quad13, quad14, quadCommon, quadAnotherCommon])

        const unification = graph1.union(graph2)

        assert.strictEqual(unification.size, 6)
        assert(unification.equals(makeWrapperDataset([
          quad11, quad12, quad13, quad14,
          quadCommon, quadAnotherCommon
        ])))
      })
    })

    describe('forEach', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.forEach, 'function')
      })

      it('should work on an empty dataset', () => {
        const quad = rdf.quad(ex.subject, ex.predicate, ex.object)
        const graph = makeWrapperDataset([quad])

        graph.forEach((_) => {});
      })

      it('should iterate once for each quads', () => {
        const quad1 = rdf.quad(ex.subject1, ex.predicate, ex.object)
        const quad2 = rdf.quad(ex.subject2, ex.predicate5, ex.object7)
        const quad3 = rdf.quad(ex.subject3, ex.predicate5, ex.object7)
        const quad4 = rdf.quad(ex.subject4, ex.predicate5, ex.object7)
        const graph = makeWrapperDataset([quad1, quad2, quad3, quad4])

        const seen_quads = []

        graph.forEach((quad) => seen_quads.push(quad))

        assert.strictEqual(seen_quads.length, 4)
        const built_graph = makeWrapperDataset(seen_quads)

        assert(built_graph.equals(graph))
      })

      it('should iterate once for each quads', () => {
        const quad1 = rdf.quad(ex.subject1, ex.predicate, ex.object)
        const quad2 = rdf.quad(ex.subject2, ex.predicate5, ex.object7)
        const quad3 = rdf.quad(ex.subject3, ex.predicate5, ex.object7)
        const quad4 = rdf.quad(ex.subject4, ex.predicate5, ex.object7)
        const graph = makeWrapperDataset([quad1, quad2, quad3])

        const seen_quads = []

        graph.forEach((quad) => {
          if (quad.equals(quad1)) {
            quad.subject = ex.subject777;
          }

          seen_quads.push(quad);
        })

        assert.strictEqual(seen_quads.length, 3)
        const built_graph = makeWrapperDataset(seen_quads)

        const base_quad1 = rdf.quad(ex.subject1, ex.predicate, ex.object)
        const modified_quad1 = rdf.quad(ex.subject777, ex.predicate, ex.object)
        assert(built_graph.equals(makeWrapperDataset([modified_quad1, quad2, quad3])))
        assert(graph.equals(makeWrapperDataset([base_quad1, quad2, quad3])))
      })

      it('should iterate on each quad once', () => {
        const quad1 = rdf.quad(ex.subject1, ex.predicate, ex.object)
        const quad2 = rdf.quad(ex.subject2, ex.predicate5, ex.object7)
        const quad3 = rdf.quad(ex.subject3, ex.predicate5, ex.object7)
        const quad4 = rdf.quad(ex.subject4, ex.predicate5, ex.object7)
        const graph = makeWrapperDataset([quad1, quad2, quad3, quad4])

        let expected_subjects = new Set([
          ex.subject1.value, ex.subject2.value, ex.subject3.value, ex.subject4.value
        ])

        graph.forEach((quad) => {
          let subject = quad.subject.value
          assert(expected_subjects.has(subject))
          expected_subjects.delete(subject)
        });

        assert.strictEqual(expected_subjects.size, 0)
      })

    })

    describe('some', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.some, 'function')
      })

      it('should find existing elements', () => {
        const quad = rdf.quad(ex.subject, ex.predicate, ex.object)
        const graph = makeWrapperDataset([quad])

        assert(graph.some(q => quad.equals(q)));
        assert(graph.some(q => q.subject.value == ex.subject.value));
        assert(!graph.some(q => q.subject.value == ex.subject145.value));
      })
    })

    describe('every', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.every, 'function')
      })

      it('should return true on a empty dataset', () => {
        const graph = makeWrapperDataset()

        assert(graph.every((quad) => false));
      })

      it('should return true if every quad verify the function', () => {
        const f = (quad) => quad.subject.equals(ex.somesubject)
        const quad1 = rdf.quad(ex.somesubject, ex.predicate1, ex.object)
        const quad2 = rdf.quad(ex.somesubject, ex.predicate2, ex.object)
        const quad3 = rdf.quad(ex.somesubject, ex.predicate3, ex.object)
        const quad4 = rdf.quad(ex.somesubject, ex.predicate4, ex.object)
        const wrong_quad = rdf.quad(ex.anothersubject, ex.predicate, ex.object)

        const graph = makeWrapperDataset([quad1, quad2, quad3, quad4])

        assert(graph.every(f))

        graph.add(wrong_quad)
        assert(!graph.every(f))
      })
    })

    describe('filter', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.filter, 'function')
      })

      it('should return true on a empty dataset', () => {
        const f = quad => true
        const dataset = makeWrapperDataset()

        assert.strictEqual(dataset.filter(f).size, 0);
      })

      it('should return an empty dataset when filtering everying', () => {
        const f = quad => false

        const quad1 = rdf.quad(ex.somesubject, ex.predicate1, ex.object)
        const quad2 = rdf.quad(ex.somesubject, ex.predicate2, ex.object)
        const quad3 = rdf.quad(ex.somesubject, ex.predicate3, ex.object)
        const quad4 = rdf.quad(ex.somesubject, ex.predicate4, ex.object)

        const dataset = makeWrapperDataset([quad1, quad2, quad3, quad4])
        const filtered_dataset = dataset.filter(f)

        assert(dataset.equals(makeWrapperDataset([quad1, quad2, quad3, quad4])))
        assert.strictEqual(filtered_dataset.size, 0)
      })

      it('should return a copy of the same dataset when the filter is always true', () => {
        const f = quad => true

        const quad1 = rdf.quad(ex.somesubject, ex.predicate1, ex.object)
        const quad2 = rdf.quad(ex.somesubject, ex.predicate2, ex.object)
        const quad3 = rdf.quad(ex.somesubject, ex.predicate3, ex.object)
        const quad4 = rdf.quad(ex.somesubject, ex.predicate4, ex.object)

        const dataset = makeWrapperDataset([quad1, quad2, quad3, quad4])
        const filtered_dataset = dataset.filter(f)

        assert(dataset.equals(filtered_dataset))

        const new_quad = rdf.quad(ex.anothersubject, ex.predicate, ex.object)
        filtered_dataset.add(new_quad)

        assert(!dataset.equals(filtered_dataset))
        assert(filtered_dataset.contains(dataset))
        assert.strictEqual(filtered_dataset.size, dataset.size + 1)
        assert(filtered_dataset.has(new_quad))
      })

      it('should properly filter the dataset', () => {
        const f = quad => quad.object.equals(ex.dog)

        const quad1 = rdf.quad(ex.somesubject, ex.predicate1, ex.cat)
        const quad2 = rdf.quad(ex.somesubject, ex.predicate2, ex.cat)
        const quad3 = rdf.quad(ex.somesubject, ex.predicate3, ex.dog)
        const quad4 = rdf.quad(ex.somesubject, ex.predicate4, ex.dog)
        const quad5 = rdf.quad(ex.somesubject, ex.predicate5, ex.cat)

        const dataset = makeWrapperDataset([quad1, quad2, quad3, quad4, quad5])
        const filtered_dataset = dataset.filter(f)

        assert(filtered_dataset.equals(makeWrapperDataset([quad3, quad4])))
      })
    })

    describe('map', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.map, 'function')
      })

      it('should do nothing when used an empty dataset', () => {
        const graph = makeWrapperDataset()

        let i = true
        assert(graph.map((quad) => {
          i = false
          return quad;
        }));

        assert.strictEqual(i, true)
      })

      it('should work', () => {
        const f = (quad) => quad.subject.equals(ex.somesubject)
        const quad1 = rdf.quad(ex.rabbit, ex.predicate1, ex.object)
        const quad2 = rdf.quad(ex.cat, ex.predicate2, ex.object)
        const quad3 = rdf.quad(ex.rabbit, ex.predicate3, ex.object)
        const quad4 = rdf.quad(ex.cat, ex.predicate4, ex.object)
        
        const quad2dog = rdf.quad(ex.dog, ex.predicate2, ex.object)
        const quad4dog = rdf.quad(ex.dog, ex.predicate4, ex.object)

        const graph = makeWrapperDataset([quad1, quad2, quad3, quad4])
        const wanted_graph = makeWrapperDataset([quad1, quad2dog, quad3, quad4dog])
        const mapped_graph = graph.map(quad => {
          if (quad.subject.equals(ex.rabbit)) {
            return quad;
          } else {
            return rdf.quad(ex.dog, quad.predicate, quad.object)
          }
        })

        assert(!graph.equals(mapped_graph))
        assert(wanted_graph.equals(mapped_graph))
      })
    })

    describe('reduce', () => {
      it('should be a function', () => {
        const dataset = makeWrapperDataset()

        assert.strictEqual(typeof dataset.reduce, 'function')
      })

      it('do nothing special with an empty dataset', () => {
        const dataset = makeWrapperDataset()
        const f = (acc, quad) => 77

        assert.strictEqual(dataset.reduce(f), undefined)
        assert.strictEqual(dataset.reduce(f, "Bzzzt"), "Bzzzt")
      })

      it('quads into one', () => {
        const minimalQuad = (acc, quad) => {
          const spaceship = (s1, s2) => {
            if (s1 < s2) {
              return -1;
            } else if (s1 > s2) {
              return 1;
            } else {
              return 0;
            }
          }

          r = [
            spaceship(acc.subject.termType, quad.subject.termType),
            spaceship(acc.subject.value, quad.subject.value),
            spaceship(acc.predicate.termType, quad.predicate.termType),
            spaceship(acc.predicate.value, quad.predicate.value),
            spaceship(acc.object.termType, quad.object.termType),
            spaceship(acc.object.value, quad.object.value),
            spaceship(acc.graph.termType, quad.graph.termType),
            spaceship(acc.graph.value, quad.graph.value)
          ]

          for (let index in r) {
            let v = r[index]
            if (v < 0) {
              return acc
            } else if (v > 0) {
              return quad
            }
          }

          return quad
        };

        const mediumQuad = rdf.quad(ex.subject, ex.jjj, ex.zzz)
        const bigQuad = rdf.quad(ex.subject, ex.zzz, ex.zzz)
        const smallQuad = rdf.quad(ex.aaa, ex.predicate, ex.object)

        const dataset = makeWrapperDataset([mediumQuad, bigQuad, smallQuad])

        assert(minimalQuad(smallQuad, mediumQuad).equals(smallQuad))
        assert(minimalQuad(mediumQuad, bigQuad).equals(mediumQuad))
        assert(minimalQuad(mediumQuad, minimalQuad(smallQuad, bigQuad)).equals(smallQuad))
        assert(dataset.reduce(minimalQuad), smallQuad)
      })

      it('quads into other types', () => {
        let predicates = [
          ex.predicate1, ex.predicate2, ex.predicate3, ex.predicate4, ex.predicate5
        ]

        let quads = []
        let predicates_names = new Set()
        for (const i in predicates) {
          quads.push(rdf.quad(ex.subject, predicates[i], ex.object))
          predicates_names.add(predicates[i].value)
        }

        let predicate_name_adder = (set, quad) => { set.add(quad.predicate.value); return set; }

        let dataset = makeWrapperDataset(quads)
        let reduced = dataset.reduce(predicate_name_adder, new Set())

        function isSuperset(set, subset) {
          for (var elem of subset) {
            if (!set.has(elem)) {
              return false;
            }
          }
          return true;
        }

        assert(isSuperset(reduced, predicates_names))
        assert(isSuperset(predicates_names, reduced))
      })

    })

    describe('WasmTreeDataset', () => {
      it('should be able to reuse the same index list of consecutive operations', () => {
        let dataset = makeWrapperDataset();
        const quad1 = rdf.quad(ex.subject1, ex.predicate, ex.object)
        const quad2 = rdf.quad(ex.subject2, ex.predicate, ex.object)
        dataset.add(quad1);
        
        for (let q of dataset) {}
  
        assert(dataset.hasIndexList());
  
        for (let q of dataset) {}
        assert(dataset.hasIndexList());
        dataset.add(quad2);
        assert(dataset.hasForest());
        assert(!dataset.hasIndexList());
  
  
      })
    })
}

module.exports = runTests
