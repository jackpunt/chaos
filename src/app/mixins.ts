import type { Constructor } from "@thegraid/common-lib";
import type { Container } from "@thegraid/easeljs-module";
import type { HexMap2 } from "./chaos-hex";


type AnyFunction = (...args: any[]) => any;
// type Constructor<T = any> = abstract new (...args: any[]) => T; // better defn of Constructor: allow 'abstract' classes

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

/**
 * Given a class that extends classB, inject classA into protoype chain, so that class extends classA extends classB;
 *
 * Note: constructor in classExtendsB must initialize both classB and classA
 *
 * @example super(args to classB); Object.assign(this, instanceOfclassA);
 *
 * @param classExtendsB someClass extends classB
 * @param classA
 * @returns with classExtendsB extends classA extends classB;
 */
export function alsoExtend(classExtendsB: Constructor<any>, classA: Constructor<any>) {
  const classB = Object.getPrototypeOf(classExtendsB.prototype.constructor); // the direct super class
  const classA_extends_classB = mixins.clonePrototypeChain(classA, classB.prototype); // annonymousClass extends classA & classB
  Object.setPrototypeOf(classExtendsB.prototype, classA_extends_classB);   // now classExtendsB extends classA & classB;
  }

/**
 * Clone prototype chain of classA; inject above classB (any initial prototype)
 *
 * for each layer classA.n: produce classA.n extends classB
 *
 * Utimately produce classC: extends classA & classB
 * @param classA
 * @param classB
 * @returns classC: extends classA & classB;
 */
export function clonePrototypeChain(
  classA: Constructor<any>,
  classB: any = Object.prototype, // initialLink
): any {
  let currentProto = classA.prototype;
  const classA_clone: any[] = [];

  // Step 1: Track and store each distinct prototype layer upward
  while (currentProto && currentProto !== Object.prototype) {
    classA_clone.push(currentProto);  // originalChain.push(currentProto);
    currentProto = Object.getPrototypeOf(currentProto);
  }

  // Step 2: Rebuild the chain top-down, anchoring to the provided initialLink parameter
  let classC = classB;     // lastCloneLink = initialLink;

  for (let i = classA_clone.length - 1; i >= 0; i--) {
    const classA_n = classA_clone[i];  // sourceProto = oritinalChain[i];

    // Provision a clean, empty layer extending from the running link reference
    const nextClassC = Object.create(classC);  // newCloneLink

    // Deep-copy all methods, properties, getters, and setters verbatim from each 'super' of classA
    const propertyDescriptors = Object.getOwnPropertyDescriptors(classA_n);
    Object.defineProperties(nextClassC, propertyDescriptors);

    // Shift tracking pointer up to the newly generated link
    classC = nextClassC;
  }

  // Step 3: Return the final head of the isolated prototype chain clone
  return classC;
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

/** find and invoke (this as Target).method(...args); */

export function superMethod<
  T extends object,
  Target,
  K extends keyof Target
>(
  instance: T,
  targetClass: Constructor<Target>,
  methodName: K,
  ...args: Target[K] extends AnyFunction ? Parameters<Target[K]> : never
): Target[K] extends AnyFunction ? ReturnType<Target[K]> : never {
  let proto = Object.getPrototypeOf(instance);

  while (proto && proto !== Object.prototype) {
    if (proto.constructor === targetClass) {
      const fn = proto[methodName];
      if (typeof fn === 'function') {
        return fn.apply(instance, args);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }

  throw new TypeError(
    `Method '${String(methodName)}' not found on prototype of ${targetClass.name}`
  );
}
