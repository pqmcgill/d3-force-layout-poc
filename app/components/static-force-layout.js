import Ember from 'ember';

export default Ember.Component.extend({
    // properties of the component
    width: 1000,
    height: 1000,

    // link and node data passed in from parent
    data: null,

    // for convenience, used to map nodes by name for easy lookup
    _nodeMap: {},

    // mutable arrays required for d3 magic
    _links: [],
    _nodes: [],

    // initial setup
    didInsertElement: function() {
      this.updateGraphData();
      this.setupGraph();
    },

    // observes changes to either data nodes or data links
    onDataChanged: function() {
      this.tearDownGraph();
      this.updateGraphData();
      this.setupGraph();
    }.observes('data.nodes', 'data.links'),

    // creates the view for the rendered visualization,
    // also creates rendered entities, and computational model
    setupGraph: function() {

      this.simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id))
        .force('charge', d3.forceManyBody().strength(-80))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2))
        .stop();

      this.simulation.nodes(this._nodes);

      this.simulation.force('link')
          .links(this._links);

      // move to bottom of call stack to allow other work to take priority
      // eventually will want to compute the initial force simulation in a webworker
      // on a separate thread so as not to hang the page
      setTimeout(() => {
          for (var i = 0, n = Math.ceil(Math.log(this.simulation.alphaMin()) / Math.log(1 - this.simulation.alphaDecay())); i < n; ++i) {
            this.simulation.tick();
          }
          this.redraw();
      }, 0);
    },

    tearDownGraph: function() {
        this.svg.selectAll('g').remove();
    },

    // mutates local state to match that of immutable parent state.
    // d3 mutates data, so we need to sync local link and node lists with
    // our application data so that d3 can perform it's mutations without touching
    // the original
    updateGraphData: function() {
      const latestNodes = this.get('data.nodes');
      const latestLinks = this.get('data.links');

      // used for tracking new nodes
      let retain = {};

      // add nodes that aren't found in old data
      latestNodes.forEach((n, i) => {
        retain[n.id] = true;

        if (!(n.id in this._nodeMap)) {
          const newNode = { id: n.id, r: 10, x: 500, y: 500 };
          this._nodes.push(newNode);
          this._nodeMap[n.id] = newNode;
        }
      });

      // delete nodes that no longer are found in new data
      this._nodes.forEach((n, i) => {
        if (!(n.id in retain)) {
          delete this._nodeMap[n.id];
          this._nodes.splice(i, 1);
        }
      });

      // just return the links straight up
      let linksCopy = [];
      for (let i = 0; i < latestLinks.length; i++) {
        let link = latestLinks[i];
        const newLink = {
          source: this._nodeMap[link.source],
          target: this._nodeMap[link.target]
        };
        linksCopy.push(newLink);
      }

      this._links = linksCopy;
    },

    redraw: function() {
        this.svg = d3.select('svg#graph')
           .attr('width', this.get('width'))
           .attr('height', this.get('height'));

        this.link = this.svg.append('g').selectAll(".link");
        this.node = this.svg.append('g').selectAll(".node");
        this.link = this.link.data(this._links);
        this.link.exit().remove();
        this.link = this.link.enter().append('line')
            .attr('stroke', '#000000')
            .attr('stroke-width', 1)
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
            .merge(this.link);

        this.node = this.node.data(this._nodes);
        this.node.exit().remove();
        this.node = this.node.enter().append('circle')
            .attr('r', d => d.r)
            .attr('fill', () => {
                return '#ABABAB';
            })
            .attr('id', d => d.id)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 10)
            .merge(this.node);
    },

    actions: {
      mutate: function() {
        this.sendAction('mutate');
      }
    }
});
