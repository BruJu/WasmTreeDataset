
use identifier_forest::quad::{Block, GSPO};
use identifier_forest::compat::IndexingForest4;
use wasm_bindgen::prelude::*;


// We write one impl block per function to make it easier to debug (if we have
// a compile error, the compiler says there is an error in the whole impl block,
// splitting in different impl blocks helps identifying the bugged function)

/// wasm_bindgen annoted adapter of IndexingForest4 intended for wasm-tree-frontend
#[wasm_bindgen(js_name="ForestOfIdentifierQuads")]
pub struct ForestOfIdentifierQuads {
    trees: IndexingForest4
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Builds an empty Quad Forest with a OGPS tree and optionals SPOG, GPSO,
    /// POGS, GSPO and OSGP trees that will be built when a match request is
    /// received for them.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { trees: IndexingForest4::new() }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Returns the number of quads
    pub fn size(&self) -> usize {
        self.trees.0.len()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Adds the given quad
    pub fn add(&mut self, s: u32, p: u32, o: u32, g: u32) {
        self.trees.insert([s, p, o, g]);
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Removes the given quad
    pub fn remove(&mut self, s: u32, p: u32, o: u32, g: u32) {
        self.trees.delete([s, p, o, g]);
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Returns true if the tree has the specified quad
    pub fn has(&self, s: u32, p: u32, o: u32, g: u32) -> bool {
        self.trees.0.contains([s, p, o, g])
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

        for quad in self.trees.filter([s, p, o, g]) {
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
            .filter([s, p, o, g])
            .for_each(|quad| { new_tree.trees.insert(quad); } );
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

impl ForestOfIdentifierQuads {
    /// Returns the number of optional trees that are currently instancied
    pub fn number_of_optional_built_trees(&self) -> usize {
        self.trees
            .get_number_of_living_trees()
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Removes from the dataset the quads that matches the given pattern
    #[wasm_bindgen(js_name = deleteMatches)]
    pub fn delete_matches(&mut self, s: Option<u32>, p: Option<u32>, o: Option<u32>, g: Option<u32>) {
        // 1- Find quads that matches
        let quads = self.trees.search_all_matching_quads([s, p, o, g], false).collect::<Vec<[u32; 4]>>();

        let ratio_threshhold = 2 + self.number_of_optional_built_trees();

        if quads.len() < self.size() / ratio_threshhold {
            // 2- Remove quads if there are not a lot to remove

            for quad in quads {
                self.trees.delete(quad);
            }
        } else {
            // 2- If there are a lot, rebuild tree
            let new_tree = ForestOfIdentifierQuads {
                trees: IndexingForest4 (
                    self.trees.base_tree().iter().filter(|blk| !blk.matches(&[s, p, o, g])).copied().map(|blk| -> [u32; 4] { blk.into() }).collect()
                )
            };
            *self = new_tree;
        }
    }
}

impl ForestOfIdentifierQuads {
    pub fn are_trivially_mergeable_trees(_lhs: &Self, _rhs: &Self) -> bool {
        // always true since block order is now determined statically
        // TODO: all tests using this method should probably be removed now
        true
    }

    fn new_tree_from_fusion<'a, BlockIterator>(iterator: BlockIterator) -> Self
        where BlockIterator: Iterator<Item=&'a GSPO<u32>>
    {
        ForestOfIdentifierQuads{
            trees: IndexingForest4(
                iterator.copied().map(|blk| -> [u32; 4] { blk.into() }).collect()
            )
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn insersect(&self, other: &ForestOfIdentifierQuads) -> ForestOfIdentifierQuads {
        if ForestOfIdentifierQuads::are_trivially_mergeable_trees(self, other) {
            Self::new_tree_from_fusion(self.trees.base_tree().intersection(&other.trees.base_tree()))
        } else {
            let mut new_tree = Self::new();

            for quad in self.trees.filter([None, None, None, None]) {
                if other.has(quad[0], quad[1], quad[2], quad[3]) {
                    new_tree.add(quad[0], quad[1], quad[2], quad[3]);
                }
            }

            new_tree
        }
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

        for quad in self.trees.filter([None, None, None, None]) {
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

        for quad in self.trees.filter([None, None, None, None]) {
            new_tree.add(quad[0], quad[1], quad[2], quad[3]);
        }

        for i in 0..other.len() / 4 {
            new_tree.trees.delete([other[i * 4], other[i * 4 + 1], other[i * 4 + 2], other[i * 4 + 3]]);
        }

        new_tree
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn union(&self, other: &ForestOfIdentifierQuads) -> Self {
        if Self::are_trivially_mergeable_trees(self, other) {
            Self::new_tree_from_fusion(self.trees.base_tree().union(&other.trees.base_tree()))
        } else {
            let mut new_tree = Self::new();

            for quad in self.trees.filter([None, None, None, None]) {
                new_tree.add(quad[0], quad[1], quad[2], quad[3]);
            }

            for quad in other.trees.filter([None, None, None, None]) {
                new_tree.add(quad[0], quad[1], quad[2], quad[3]);
            }
            
            new_tree
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn difference(&self, other: &ForestOfIdentifierQuads) -> Self {
        if Self::are_trivially_mergeable_trees(self, other) {
            Self::new_tree_from_fusion(self.trees.base_tree().difference(&other.trees.base_tree()))
        } else {
            let mut new_tree = Self::new();

            for quad in self.trees.filter([None, None, None, None]) {
                if !other.has(quad[0], quad[1], quad[2], quad[3]) {
                    new_tree.add(quad[0], quad[1], quad[2], quad[3]);
                }
            }
            
            new_tree
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn contains(&self, other: &ForestOfIdentifierQuads) -> bool {
        if Self::are_trivially_mergeable_trees(self, other) {
            self.trees.base_tree().is_superset(&other.trees.base_tree())
        } else {
            for quad in other.trees.filter([None, None, None, None]) {
                if !self.has(quad[0], quad[1], quad[2], quad[3]) {
                    return false;
                }
            }
            
            true
        }
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen(js_name = containsIdentifierList)]
    pub fn contains_slice(&self, other: &[u32]) -> bool {
        assert!(other.len() % 4 == 0);
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
        if self.trees.0.len() != other.len() / 4 {
            return false;
        }

        self.contains_slice(other)
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    #[wasm_bindgen]
    pub fn has_same_elements(&self, other: &ForestOfIdentifierQuads) -> bool {
        if self.trees.0.len() != other.trees.0.len() {
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
        let spog = [s, p, o, g];
        return self.trees.search_all_matching_quads(spog, true).count();
    }
}

#[wasm_bindgen(js_class="ForestOfIdentifierQuads")]
impl ForestOfIdentifierQuads {
    /// Ensures the best tree to search quads matching the given pattern is built
    #[wasm_bindgen(js_name = ensureHasIndexfor)]
    pub fn ensure_has_index_for(&mut self, s: bool, p: bool, o: bool, g: bool) {
        self.trees.ensure_has_index_for(s, p, o, g);
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
