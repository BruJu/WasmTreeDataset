#!/usr/bin/env python3
import os
import json
import shutil
from collections import OrderedDict

# This script enables to build a package both for nodejs and bundlers

def main():
    different_files = [
        "wasm_tree_backend.js",
        "wasm_tree_backend_bg.wasm"
    ]

    extra_files = ["./wasm_tree_backend_bg.js"]

    def get_bundler_name(nodename):
        index = nodename.rfind(".")
        return nodename[0:index] + ".browser" + nodename[index:]

    print("= Building for bundlers")
    os.system("wasm-pack build -d pkgbrowser")
    
    print("= Building for nodejs")
    os.system("wasm-pack build --target nodejs --scope=bruju")
    
    print("= Moving browser specifics files")
    for file in different_files:
        os.rename("pkgbrowser/" + file, "pkg/" + get_bundler_name(file))
    
    for file in extra_files:
        os.rename("pkgbrowser/" + file, "pkg/" + file)
    
    print("= Deleting pkgbrowser tempory folder")
    shutil.rmtree("./pkgbrowser")

    print("= Rewriting package.json")
    with open("pkg/package.json", "r") as json_file:
        data = json.load(json_file)
    
    data["browser"] = OrderedDict()

    for file in different_files:
        data["files"].append(get_bundler_name(file))
        data["browser"]["./" + file] = "./" + get_bundler_name(file)

    for file in extra_files:
        data["files"].append(get_bundler_name(file))

    data["sideEffects"] = False
    data["module"] = get_bundler_name(different_files[0])

    with open("pkg/package.json", "w") as json_file:
        json.dump(data, json_file, indent=2)

    print("= Finished")

if __name__ == '__main__':
    main()
