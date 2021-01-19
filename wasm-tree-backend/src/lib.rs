
// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

use identifier_forest::order::{ Position, Subject, Predicate, Object, Graph };
use identifier_forest::run_time_forest::IndexingForest4;
use identifier_forest::tree::{ MaybeTree4, Forest4, BinaryMaybe4TreeOperations };
use wasm_bindgen::prelude::*;


// We write one impl block per function to make it easier to debug (if we have
// a compile error, the compiler says there is an error in the whole impl block,
// splitting in different impl blocks helps identifying the bugged function)

/// wasm_bindgen annoted adapter of IndexingForest4 intended for wasm-tree-frontend
#[wasm_bindgen(js_name="ForestOfIdentifierQuads")]
pub struct ForestOfIdentifierQuads {
    trees: IndexingForest4<u32>
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Builds an empty Quad Forest with an OGPS tree and optionals SPOG, GPSO,
    /// POGS, GSPO and OSGP trees that will be built when a match request is
    /// received for them.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        const S: usize = Subject::VALUE;
        const P: usize = Predicate::VALUE;
        const O: usize = Object::VALUE;
        const G: usize = Graph::VALUE;

        Self {
            trees: IndexingForest4::<u32>::new_with_indexes(
                &[[O, G, P, S]],
                &[
                    [S, P, O, G],
                    [G, P, S, O],
                    [P, O, G, S],
                    [G, S, P, O],
                    [O, S, G, P]
                ],
            )
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Returns the number of quads
    pub fn size(&self) -> usize {
        self.trees.size().unwrap()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Adds the given quad
    pub fn add(&mut self, s: u32, p: u32, o: u32, g: u32) {
        self.trees.insert(&[s, p, o, g]);
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Removes the given quad
    pub fn remove(&mut self, s: u32, p: u32, o: u32, g: u32) {
        self.trees.delete(&[s, p, o, g]);
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Returns true if the tree has the specified quad
    pub fn has(&self, s: u32, p: u32, o: u32, g: u32) -> bool {
        self.trees.has(&[s, p, o, g]).unwrap()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Returns a slice with every quad flattened
    pub fn get_all(&self, s: Option<u32>, p: Option<u32>, o: Option<u32>, g: Option<u32>) -> Box<[u32]> {
        // We return a Box<[u32]> because :
        // 1- wasm bindgen has a memory friendly way to return this data structure (no memory leak)
        // 2- memcpy-ing is stupidly fast

        let mut vector = vec!();

        for quad in self.trees.get_quads([s, p, o, g]) {
            vector.push(quad[0]);
            vector.push(quad[1]);
            vector.push(quad[2]);
            vector.push(quad[3]);
        }
        
        vector.into_boxed_slice()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Builds a new dataset which is built by filtering with the given s, p, o and g.
    pub fn new_from(&self, s: Option<u32>, p: Option<u32>, o: Option<u32>, g: Option<u32>) -> Self {
        let mut new_tree = ForestOfIdentifierQuads::new();
        self.trees
            .get_quads([s, p, o, g])
            .for_each(|quad| { new_tree.trees.insert(&quad); } );
        new_tree
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Insert every quads described in the passed identifier list.
    ///
    /// the identifier list is a multiple of 4 size array in which every
    /// integer can be grouped in groups of 4 to get the identifier of
    /// the subjet, the predicate, the object and the graph of each quad.
    #[wasm_bindgen(js_name = insertFromIdentifierList)]
    pub fn insert_from_identifier_list(&mut self, encoded_quads: &[u32]) {
        for i in 0..(encoded_quads.len() / 4) {
            self.add(
                encoded_quads[i * 4 + 0],
                encoded_quads[i * 4 + 1],
                encoded_quads[i * 4 + 2],
                encoded_quads[i * 4 + 3]
            );
        }
    }

    /// Builds a ForestOfIdentifierQuads from an identifier list of quads
    /// 
    /// If you have previously extracted an identifier list from get_all, you
    /// can easily build a new dataset with this function.
    #[wasm_bindgen(js_name = fromIdentifierList)]
    pub fn new_from_identifier_list(encoded_quads: &[u32]) -> Self {
        let mut new_tree = Self::new();
        new_tree.insert_from_identifier_list(encoded_quads);
        new_tree
    }
}

// ==== RDF.JS Dataset backend implementation
// (https://rdf.js.org/dataset-spec/#dataset-interface)

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Removes from the dataset the quads that matches the given pattern
    #[wasm_bindgen(js_name = deleteMatches)]
    pub fn delete_matches(&mut self, s: Option<u32>, p: Option<u32>, o: Option<u32>, g: Option<u32>) {
        // 1- Find quads that matches
        let removed_quads = self.trees.get_quads_unamortized([s, p, o, g]).collect::<Vec<[u32; 4]>>();

        let ratio_threshhold = 1 + self.get_number_of_living_trees();

        // 2- If there are a lot of quads to remove, ensure there is only one tree
        if false && removed_quads.len() >= self.size() / ratio_threshhold {
            let mut new_forest = Self::new();
            
            for quad in self.trees.iter() {
                &mut new_forest.trees.insert(&quad);
            }

            *self = new_forest;
        }

        // 3- Remove the quads
        for quad in removed_quads {
            self.trees.delete(&quad);
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn insersect(&self, other: &ForestOfIdentifierQuads) -> ForestOfIdentifierQuads {
        Self { trees: self.trees.intersect(&other.trees) }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen(js_name = intersectIdentifierList)]
    pub fn intersect_slice(&self, other: &[u32]) -> Self {
        let mut new_tree = Self::new();

        for i in 0..other.len() / 4 {
            if self.has(other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]) {
                new_tree.add(other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]);
            }
        }

        new_tree
    }

    #[wasm_bindgen(js_name = unionIdentifierList)]
    pub fn union_slice(&self, other: &[u32]) -> Self {
        let mut new_tree = Self::new();

        for quad in self.trees.iter() {
            new_tree.add(quad[0], quad[1], quad[2], quad[3]);
        }

        for i in 0..other.len() / 4 {
            new_tree.add(other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]);
        }

        new_tree
    }

    #[wasm_bindgen(js_name = differenceIdentifierList)]
    pub fn difference_slice(&self, other: &[u32]) -> Self {
        let mut new_tree = Self::new();

        for quad in self.trees.iter() {
            new_tree.add(quad[0], quad[1], quad[2], quad[3]);
        }

        for i in 0..other.len() / 4 {
            new_tree.trees.delete(&[other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]]);
        }

        new_tree
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn union(&self, other: &ForestOfIdentifierQuads) -> Self {
        Self { trees: self.trees.union(&other.trees) }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn difference(&self, other: &ForestOfIdentifierQuads) -> Self {
        Self { trees: self.trees.difference(&other.trees) }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn contains(&self, other: &ForestOfIdentifierQuads) -> bool {
        self.trees.contains(&other.trees).unwrap()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen(js_name = containsIdentifierList)]
    pub fn contains_slice(&self, other: &[u32]) -> bool {
        if other.len() % 4 != 0 {
            return false;
        }

        let mut i = 0;
        while i != other.len() / 4 { 
            if !self.has(other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]) {
                return false;
            }
            i = i + 1;
        }

        true
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen(js_name = equalsIdentifierList)]
    pub fn equals_slice(&self, other: &[u32]) -> bool {
        if self.size() != other.len() / 4 {
            return false;
        }

        self.contains_slice(other)
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn has_same_elements(&self, other: &ForestOfIdentifierQuads) -> bool {
        if self.size() != other.size() {
            return false;
        }

        self.contains(other)
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Counts the number of quads that matches the given pattern
    #[wasm_bindgen(js_name = matchCount)]
    pub fn match_count(&self, s: Option<u32>, p: Option<u32>, o: Option<u32>, g: Option<u32>) -> usize {
        return self.trees.get_quads([s, p, o, g]).count();
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Ensures the best tree to search quads matching the given pattern is built
    #[wasm_bindgen(js_name = ensureHasIndexfor)]
    pub fn ensure_has_index_for(&mut self, s: bool, p: bool, o: bool, g: bool) {
        let bool_to_opt = |b| if b { Some(0_u32) } else { None };

        self.trees.ensure_has_index_for(
            &[
                bool_to_opt(s),
                bool_to_opt(p),
                bool_to_opt(o),
                bool_to_opt(g)
            ]
        );
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Counts the number of living trees
    #[wasm_bindgen(js_name = getNumberOfLivingTrees)]
    pub fn get_number_of_living_trees(&self) -> usize {
        self.trees.get_number_of_living_trees()
    }
}
