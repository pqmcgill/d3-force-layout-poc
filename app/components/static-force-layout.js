import Ember from 'ember';

export default Ember.Component.extend({
    // properties of the component
    width: 1000,
    height: 1000,
    scale: 1,

    isLoading: true,

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
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2));

      this.simulation.nodes(this._nodes)

      this.simulation.force('link')
          .links(this._links);

      // move to bottom of call stack to allow other work to take priority
      // eventually will want to compute the initial force simulation in a webworker
      // on a separate thread so as not to hang the page
      setTimeout(() => {
          const steps = Math.ceil(Math.log(this.simulation.alphaMin()) / Math.log(1 - this.simulation.alphaDecay()));
          for (var i = 0, n = steps; i < n; ++i) {
            this.simulation.tick();
          }
          this.set('isLoading', false);
          this.redraw();
          this.simulation.restart();
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
          const newNode = {
              id: n.id,
              r: 10
          };
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
        const self = this;
        const margin = { top: 0, right: 0, bottom: 0, left: 0 };
        this.zoom = d3.zoom()
            .scaleExtent([-100, 100])
            .on('zoom', function() {
                self.onZoom(self);
            });

        this.svg = d3.select('svg#graph')
           .attr('width', this.get('width'))
           .attr('height', this.get('height'))
            .call(this.zoom)
                .append('g');

        this.link = this.svg.append('g').selectAll(".link");
        this.node = this.svg.append('g').selectAll(".node");

        const linkMap = this._links.map(link => ({ source: link.source.id, target: link.target.id }));

        const forceBundle = d3.ForceEdgeBundling()
            .nodes(this._nodeMap)
            .edges(linkMap)
            .bundling_stiffness(0.1)
            .compatibility_threshold(0.1);

        const forceBundledLinks = forceBundle();

        const line = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveLinear);

        this.link = this.link.data(forceBundledLinks);
        this.link.exit().remove();
        this.link = this.link.enter().append('path')
            .attr('id', (d, i) => `link-${i}`)
            .attr('class', 'edge')
            .attr('fill', 'none')
            .attr('stroke', '#72CF1D')
            .attr('stroke-opacity', 0.3)
            .attr('stroke-width', 1)
            .attr('d', (d, i) => {
                return line(forceBundledLinks[i]);
            })
            .on('mouseover', this.onLinkMouseOver.bind(this))
            .on('mouseout', this.onLinkMouseOut.bind(this))
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
            .attr('r', 5)
            .on('mouseover', this.onNodeMouseOver.bind(this))
            .on('mouseout', this.onNodeMouseOut.bind(this))
            .merge(this.node);
    },

    onNodeMouseOver: function(d) {
        const linkedRelationships = this.findLinkedRelationships(d);
        this.highlightRelationships(linkedRelationships);
    },

    onNodeMouseOut: function() {
        this.resetStyledRelationships();
    },

    onLinkMouseOver: function(d, i) {
        this.highlightRelationships({
            nodes: [ d.source, d.target ],
            links: [ d ]
        });
    },

    onLinkMouseOut: function() {
        this.resetStyledRelationships();
    },

    onZoom: function(context) {
        const { x, y, k } = d3.event.transform;
        context.scale = k;
        context.svg.attr('transform', `translate(${x},${y}) scale(${k})`);
        context.link
            .attr('stroke-width', 1 / k);

        context.node
            .attr('r', 5 / k);
    },

    // highlight the node that was clicked as well as those nodes that are
    // directly linked to it
    highlightRelationships: function(linkedRelationships) {
        const { links, nodes } = linkedRelationships
        d3.selectAll('circle')
            .attr('fill', '#D5D5D5');

        nodes.forEach(node => {
            d3.select(`#${node.id}`)
                .attr('fill', '#72CF1D');
        });

        links.forEach(link => {
            d3.select(`#link-${link.index}`)
                .attr('stroke', '#72CF1D')
                .attr('stroke-opacity', 1)
                .attr('stroke-width', 2 / this.scale);
        });
    },

    resetStyledRelationships: function() {
        d3.selectAll('circle')
            .attr('fill', '#ABABAB');

        d3.selectAll('.edge')
            .attr('stroke', '#72CF1D')
            .attr('stroke-opacity', 0.3)
            .attr('stroke-width', 1 / this.scale);
    },

    // return array of directly linked nodes given a particular node
    findLinkedRelationships: function(node) {
        return this._links.reduce((acc, link) => {
            if (link.source.id === node.id) {
                acc = {
                    links: [ ...acc.links, link ],
                    nodes: [ ...acc.nodes, link.target ]
                };
            }
            if (link.target.id === node.id) {
                acc = {
                    links: [ ...acc.links, link ],
                    nodes: [ ...acc.nodes, link.source ]
                };
            }
            return acc;
        }, { nodes: [node], links: []});
    },

    actions: {
      mutate: function() {
        this.sendAction('mutate');
      }
    }
});
