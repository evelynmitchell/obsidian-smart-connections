import { SmartEntitiesView } from "./smart_entities_view.js";

export class ScConnectionsView extends SmartEntitiesView {
  static get view_type() { return "smart-connections-view"; }
  static get display_text() { return "Smart Connections"; }
  static get icon_name() { return "smart-connections"; }
  main_component_key = "connections";

  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.results_container = null;
    this.header_container = null;
    this.footer_container = null;
  }

  register_plugin_events() {
    this.plugin.registerEvent(this.app.workspace.on('file-open', (file) => {
      if (!file) return;
      this.render_view(file?.path);
    }));

    this.plugin.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf.view instanceof this.constructor) {
        this.render_view();
      }
    }));
  }

  async render_results(entity, opts = {}) {
    if (!this.results_container) return;
    this.entities_count_elm = this.header_container.querySelector('.sc-context');
    this.entities_count_elm.innerText = `${this.env.smart_sources.keys.length} (${this.env.smart_blocks.keys.length})`;
    this.entities_count_elm.dataset.key = entity.key;
    this.status_elm = this.footer_container.querySelector('.sc-context');
    this.status_elm.innerText = "Loading...";

    const results = entity.find_connections({ 
      ...opts, 
      exclude_source_connections: entity.env.smart_blocks.settings.embed_blocks 
    });
    
    const results_frag = await entity.env.render_component('results', results, opts);
    
    // Clear and update results container
    this.results_container.innerHTML = '';
    Array.from(results_frag.children).forEach((elm) => {
      this.results_container.appendChild(elm);
    });
    this.results_container.dataset.key = entity.key;
    const context_name = (entity.path).split('/').pop();
    this.status_elm.innerText = context_name;
    return results;
  }
  
  main_components_opts = {
    add_result_listeners: this.add_result_listeners.bind(this),
    attribution: this.attribution,
    open_lookup_view: this.plugin.open_lookup_view.bind(this.plugin),
    re_render: this.re_render.bind(this),
  };
  async render_view(entity=null, container=this.container) {
    if (container.checkVisibility() === false) return console.log("View inactive, skipping render nearest");
    
    if (!entity) {
      const current_file = this.app.workspace.getActiveFile();
      if (current_file) entity = current_file?.path;
    }
    
    let key = null;
    if (typeof entity === "string") {
      const collection = entity.includes("#") ? this.env.smart_blocks : this.env.smart_sources;
      key = entity;
      entity = collection.get(key);
    }
    
    if (!entity) return this.plugin.notices.show("no entity", "No entity found for key: " + key);
    
    // Handle PDF special case
    if(entity.collection_key === "smart_sources" && entity?.path?.endsWith(".pdf")){
      const page_number = this.app.workspace.getActiveFileView().contentEl.firstChild.firstChild.children[8].value;
      if(!["1", 1].includes(page_number)){ // skip page 1
        const page_block = entity.blocks?.find(b => b.sub_key.includes(`age ${page_number}`));
        if(page_block){
          return await this.render_view(page_block);
        }
      }
    }

    // Check if we need to re-render the whole view
    if (!this.results_container || this.current_context !== entity?.key) {
      this.current_context = entity?.key;
      

      // Render full connections view
      const frag = await entity.env.render_component(this.main_component_key, this, this.main_components_opts);
      container.empty();
      container.appendChild(frag);
      
      // Store reference to containers
      this.results_container = container.querySelector('.sc-list');
      this.header_container = container.querySelector('.sc-top-bar');
      this.footer_container = container.querySelector('.sc-bottom-bar');
      

      // Add listeners
      this.add_top_bar_listeners();
      
      // Render initial results
      await this.render_results(entity, this.main_components_opts);
    } else {
      // Just update results if container exists
      await this.render_results(entity, {
        add_result_listeners: this.add_result_listeners.bind(this),
        attribution: this.attribution
      });
    }
  }

  re_render() {
    console.log("re_render");
    this.env.connections_cache = {}; // clear cache
    this.current_context = null;
    this.render_view();
  }

  add_top_bar_listeners() {
    const container = this.container;


    container.querySelectorAll(".sc-context").forEach(el => {
      const entity = this.env.smart_sources.get(el.dataset.key);
      if(entity){
        el.addEventListener("click", () => {
          new SmartNoteInspectModal(this.env, entity).open();
        });
      }
    });
  }
}
// function on_open_overlay(overlay_container) {
//   overlay_container.style.transition = "background-color 0.5s ease-in-out";
//   overlay_container.style.backgroundColor = "var(--bold-color)";
//   setTimeout(() => { overlay_container.style.backgroundColor = ""; }, 500);
// }

import { Modal } from "obsidian";
export class SmartNoteInspectModal extends Modal {
  constructor(env, entity) {
    super(env.smart_connections_plugin.app);
    this.entity = entity;
    this.env = env;
    this.template = this.env.opts.templates["smart_note_inspect"];
    this.ejs = this.env.ejs;
  }
  onOpen() {
    this.titleEl.innerText = this.entity.key;
    this.render();
  }
  async render() {
    const html = await this.ejs.render(this.template, { note: this.entity }, { async: true });
    // console.log(html);
    this.contentEl.innerHTML = html;
  }
}