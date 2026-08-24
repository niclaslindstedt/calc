// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import {
  DEFAULT_NAMESPACE_SLUG,
  addNamespace,
  parseNamespaces,
  removeNamespace,
  renameNamespace,
  serializeNamespaces,
  setNamespaceAppearance,
  type Namespace,
  type NamespaceAppearance,
} from "@niclaslindstedt/oss-framework/namespaces";

const LIST_KEY = "calc:namespaces";
const ACTIVE_KEY = "calc:namespace:active";

// Namespaces are separate calculator workspaces: each maps to its own
// directory subtree in the storage backend (`<slug>/calculations/`, default
// at the root). The registry itself is a device preference, so it lives in
// localStorage like the sibling apps'.
export function useNamespaces() {
  const [list, setList] = useLocalStorageState<Namespace[]>(
    LIST_KEY,
    parseNamespaces(null),
    { parse: parseNamespaces, serialize: serializeNamespaces },
  );
  const [activeSlug, setActiveSlug] = useLocalStorageState<string>(
    ACTIVE_KEY,
    DEFAULT_NAMESPACE_SLUG,
    { parse: (raw) => raw, serialize: (slug) => slug },
  );
  const active =
    list.find((n) => n.slug === activeSlug) ??
    list.find((n) => n.slug === DEFAULT_NAMESPACE_SLUG) ??
    list[0];

  const create = useCallback(
    (name: string, appearance?: NamespaceAppearance) => {
      let createdSlug = "";
      setList((prev) => {
        const { list: next, created } = addNamespace(prev, name);
        createdSlug = created.slug;
        return appearance
          ? setNamespaceAppearance(next, created.slug, appearance)
          : next;
      });
      if (createdSlug) setActiveSlug(createdSlug);
    },
    [setList, setActiveSlug],
  );

  const rename = useCallback(
    (slug: string, name: string) =>
      setList((prev) => renameNamespace(prev, slug, name)),
    [setList],
  );

  const setAppearance = useCallback(
    (slug: string, patch: NamespaceAppearance) =>
      setList((prev) => setNamespaceAppearance(prev, slug, patch)),
    [setList],
  );

  const remove = useCallback(
    (slug: string) => {
      setList((prev) => removeNamespace(prev, slug));
      setActiveSlug((prev) => (prev === slug ? DEFAULT_NAMESPACE_SLUG : prev));
    },
    [setList, setActiveSlug],
  );

  return {
    list,
    active,
    activeSlug: active?.slug ?? DEFAULT_NAMESPACE_SLUG,
    switchTo: setActiveSlug,
    create,
    rename,
    setAppearance,
    remove,
  };
}
