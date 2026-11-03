    /// SparkWorld's lazy electrical placement: validate first, then commit a
    /// definition (only when absent) and its first reference as ONE undo step.
    /// Opening a drawing does not seed a library or duplicate the document.
    pub(super) fn control_spark_symbol_place(&mut self, req: &Value) -> Result<Task<Message>, Value> {
        let i = self.active_tab;
        if self.tabs[i].scene.block_edit_block.is_some() {
            return Err(failure("block_editor", "Close the block editor before electrical placement"));
        }
        let name = string(req, "name")?.to_owned();
        if !name.starts_with("SPARKWORLD_") || name.len() > 160
            || !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_') {
            return Err(failure("invalid_name", "Supply a unique SparkWorld block name"));
        }
        let mut spec = req["insert"].clone();
        spec["type"] = json!("Insert");
        spec["block"] = json!(name);
        let insert = build_entity(&spec, Some(&self.tabs[i].scene.document))?;
        let exists = self.tabs[i].scene.document.block_records.iter().any(|b| b.name == name);
        let built: Vec<codec::EntityType> = if exists { Vec::new() } else {
            let list = req["entities"].as_array().filter(|v| !v.is_empty() && v.len() <= 128)
                .ok_or_else(|| failure("entities_required", "Supply the symbol vectors"))?;
            list.iter().map(|value| {
                if value["type"] != "LwPolyline" || value["layer"] != "0" {
                    return Err(failure("invalid_symbol", "Symbol definitions require layer-0 polylines"));
                }
                build_entity(value, Some(&self.tabs[i].scene.document))
            }).collect::<Parsed<_>>()?
        };
        self.push_undo_snapshot(i, "Place electrical symbol");
        let scene = &mut self.tabs[i].scene;
        let layer = insert.common().layer.clone();
        if !scene.document.layers.contains(&layer) {
            let mut record = codec::tables::Layer::new(layer);
            record.handle = scene.document.allocate_handle();
            scene.document.layers.add(record).map_err(|e| failure("layer_failed", e))?;
        }
        if !exists {
            let handles: Vec<_> = built.into_iter().map(|entity| scene.add_entity(entity)).collect();
            let identity = codec::types::Transform::from_translation(codec::types::Vector3::new(0.0,0.0,0.0));
            let seed = scene.create_block_from_entities(&handles, &name, &identity, &identity)
                .map_err(|e| failure("block_failed", e))?;
            scene.erase_entities(&[seed]);
        }
        let handle = scene.add_entity(insert);
        self.post_ref_op(i);
        self.set_control_result(json!({"handles":[format!("{:X}", handle.value())],"block":name,"created_definition":!exists}));
        Ok(Task::none())
    }

