import type { Constructor } from "@thegraid/common-lib";
import type { Container } from "@thegraid/easeljs-module";
import type { HexMap2 } from "./chaos-hex";

export namespace mixins {
// export type Constructor<T = {}> = new (...args: any[]) => T;
export function dynamicMixin(classA: Constructor<any>, classB: Constructor<any>)
  // minor surgery for PlayerPanel to become enough of a HexMap to use mapCont = CardPanel
  {
    // Find the last prototype of classA before Object.prototype
    let rootA: any = classA.prototype;
    while (Object.getPrototypeOf(rootA) && Object.getPrototypeOf(rootA) !== Object.prototype) {
      rootA = Object.getPrototypeOf(rootA);
    }
    // Splice prototype chain of classB onto the end of classA's root (all the classB methods)
    // sadly, all instances of rootA inherit classB. So Panel -> DisplayObject -> classB -> Object
    Object.setPrototypeOf(rootA, classB.prototype);
  }

export function clonePrototypeChain(
  classA: Constructor<any>,
  initialLink: any = Object.prototype
): any {
  let currentProto = classA.prototype;
  const originalChain: any[] = [];

  // Step 1: Track and store each distinct prototype layer upward
  while (currentProto && currentProto !== Object.prototype) {
    originalChain.push(currentProto);
    currentProto = Object.getPrototypeOf(currentProto);
  }

  // Step 2: Rebuild the chain top-down, anchoring to the provided initialLink parameter
  let lastClonedLink = initialLink;

  for (let i = originalChain.length - 1; i >= 0; i--) {
    const sourceProto = originalChain[i];

    // Provision a clean, empty layer extending from the running link reference
    const newCloneLink = Object.create(lastClonedLink);

    // Deep-copy all methods, properties, getters, and setters verbatim
    const propertyDescriptors = Object.getOwnPropertyDescriptors(sourceProto);
    Object.defineProperties(newCloneLink, propertyDescriptors);

    // Shift tracking pointer up to the newly generated link
    lastClonedLink = newCloneLink;
  }

  // Step 3: Return the final head of the isolated prototype chain clone
  return lastClonedLink;
}

// classA2 extends classA1 { ... }
// to *also* extend classB:
//
// const bOverA1 = clonePrototypeChain(ClassB, ClassA1.prototype);
//
// typically modify all of ClassA:
// Object.setPrototypeOf(classA2.prototype, bOverA1);
//
// One always needs to set the instance variables from an instance of ClassB
// constructor(instB: ClassB) {
//    super();
//    Object.assign(this, instB);
// }
// Can make specific instances of ClassA2 (extends ClassA1 & ClassB)
// setPrototypeOf(instancA2, bOverA1); replacing the original simple ClassA1

export function mixinHexMap(classA: Constructor<Container>, classB: Constructor<HexMap2>)
  // inject ClassB...<Object> directly below classA in classA prototype chain.
  {
    let aRest: any = Object.getPrototypeOf(classA.prototype);
    // Find the last prototype of classA before Object.prototype
    let bRoot: any = classB.prototype;
    while (Object.getPrototypeOf(bRoot) && Object.getPrototypeOf(bRoot) !== Object.prototype) {
      bRoot = Object.getPrototypeOf(bRoot);
    }
    // Splice prototype chain of classB onto the end of classA's root (all the classB methods)
    Object.setPrototypeOf(bRoot, aRest);

  }
}
