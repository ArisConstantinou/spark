// SPDX-License-Identifier: GPL-3.0-only
//! Copy-on-write storage for immutable cached text geometry.
//! Reads and clones share storage. Every mutable access first detaches it.
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

#[derive(Debug, PartialEq)]
pub struct WireVec<T>(Arc<Vec<T>>);
impl<T> Clone for WireVec<T> {
    fn clone(&self) -> Self { Self(Arc::clone(&self.0)) }
    fn clone_from(&mut self, other: &Self) { self.0 = Arc::clone(&other.0); }
}
impl<T> Default for WireVec<T> {
    fn default() -> Self { Self(Arc::new(Vec::new())) }
}
impl<T> From<Vec<T>> for WireVec<T> {
    fn from(value: Vec<T>) -> Self { Self(Arc::new(value)) }
}
impl<T: Clone> From<WireVec<T>> for Vec<T> {
    fn from(value: WireVec<T>) -> Self {
        Arc::try_unwrap(value.0).unwrap_or_else(|shared| shared.as_ref().clone())
    }
}
impl<T> Deref for WireVec<T> {
    type Target = Vec<T>;
    fn deref(&self) -> &Vec<T> { self.0.as_ref() }
}
impl<T: Clone> DerefMut for WireVec<T> {
    fn deref_mut(&mut self) -> &mut Vec<T> { Arc::make_mut(&mut self.0) }
}
impl<T> FromIterator<T> for WireVec<T> {
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self { Vec::from_iter(iter).into() }
}
impl<T: Clone> Extend<T> for WireVec<T> {
    fn extend<I: IntoIterator<Item = T>>(&mut self, iter: I) { self.deref_mut().extend(iter); }
}
impl<T: Clone> IntoIterator for WireVec<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;
    fn into_iter(self) -> Self::IntoIter { Vec::<T>::from(self).into_iter() }
}
impl<'a, T> IntoIterator for &'a WireVec<T> {
    type Item = &'a T;
    type IntoIter = std::slice::Iter<'a, T>;
    fn into_iter(self) -> Self::IntoIter { self.iter() }
}
impl<'a, T: Clone> IntoIterator for &'a mut WireVec<T> {
    type Item = &'a mut T;
    type IntoIter = std::slice::IterMut<'a, T>;
    fn into_iter(self) -> Self::IntoIter { self.deref_mut().iter_mut() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, rc::Rc};
    #[derive(Debug)]
    struct Counted { value: u32, copies: Rc<Cell<u32>> }
    impl Clone for Counted {
        fn clone(&self) -> Self {
            self.copies.set(self.copies.get() + 1);
            Self { value: self.value, copies: self.copies.clone() }
        }
    }
    #[test]
    fn cloning_cached_geometry_never_clones_its_vertices() {
        let copies=Rc::new(Cell::new(0));
        let original: WireVec<_>=(0..4096).map(|value|Counted {value,copies:copies.clone()}).collect();
        let mut clone=original.clone();
        assert!(Arc::ptr_eq(&original.0,&clone.0));
        assert_eq!(copies.get(),0);
        assert_eq!(clone[3000].value,3000);
        clone[3000].value=7;
        assert!(!Arc::ptr_eq(&original.0,&clone.0));
        assert_eq!(copies.get(),4096);
        assert_eq!(original[3000].value,3000);
        assert_eq!(clone[3000].value,7);
        clone[0].value=8;
        assert_eq!(copies.get(),4096);
    }
    #[test]
    fn owned_conversion_reuses_unique_storage() {
        let source=vec![[1.0f32,2.0,3.0];128];let pointer=source.as_ptr();
        let shared:WireVec<_>=source.into();let result:Vec<_>=shared.into();
        assert_eq!(pointer,result.as_ptr());
    }
    #[test]
    fn owned_iteration_and_conversion_preserve_other_readers() {
        let original:WireVec<_>=vec![1,2,3].into();
        let converted:Vec<_>=original.clone().into();
        assert_eq!(converted,vec![1,2,3]);
        assert_eq!(original.clone().into_iter().collect::<Vec<_>>(),vec![1,2,3]);
        assert_eq!(&original[..],&[1,2,3]);
    }
    #[test]
    fn transforms_and_clipping_do_not_modify_cached_source() {
        let original:WireVec<_>=vec![[1.0f32,2.0],[3.0,4.0]].into();
        let mut moved=original.clone();for point in &mut moved {point[0]+=10.0;}
        moved.retain(|point|point[0]>12.0);
        assert_eq!(&original[..],&[[1.0,2.0],[3.0,4.0]]);
        assert_eq!(&moved[..],&[[13.0,4.0]]);
        let mut cleared=original.clone();cleared.clear();
        assert!(cleared.is_empty());assert_eq!(original.len(),2);
    }
    #[test]
    fn append_take_and_clone_from_keep_vec_semantics() {
        let original:WireVec<_>=vec![1,2].into();let mut changed=original.clone();
        changed.extend([3,4]);let mut tail=vec![5];changed.append(&mut tail);
        assert!(tail.is_empty());assert_eq!(&changed[..],&[1,2,3,4,5]);
        let taken=std::mem::take(&mut changed);assert!(changed.is_empty());
        assert_eq!(&taken[..],&[1,2,3,4,5]);
        changed.clone_from(&original);assert!(Arc::ptr_eq(&original.0,&changed.0));
        assert_eq!(&original[..],&[1,2]);
    }
}
