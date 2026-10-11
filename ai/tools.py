from typing import Callable, Dict, Any, Type, Optional
from pydantic import BaseModel, Field, ValidationError, ConfigDict
from database import SessionLocal
from models import CatalogItemModel

class ToolInterface:
    def __init__(self, name: str, description: str, func: Callable, schema: Type[BaseModel] = None):
        self.name = name
        self.description = description
        self.func = func
        self.schema = schema
        
    def run(self, **kwargs) -> Any:
        if self.schema:
            try:
                validated_args = self.schema(**kwargs)
                return self.func(**validated_args.model_dump(exclude_unset=True))
            except ValidationError as e:
                return {"error": "Invalid arguments provided to tool", "details": e.errors()}
        return self.func(**kwargs)

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolInterface] = {}
        
    def register(self, tool: ToolInterface):
        self._tools[tool.name] = tool
        
    def get_tool(self, name: str) -> ToolInterface | None:
        return self._tools.get(name)

    def execute(self, name: str, arguments: dict, *, allow_write: bool = False):
        tool = self.get_tool(name)
        if tool is None:
            return {"error": "Unknown tool"}
        if not isinstance(arguments, dict):
            return {"error": "Tool arguments must be an object"}
        if not tool.schema:
            return {"error": "Unvalidated tool is not executable"}
        try:
            args = tool.schema.model_validate(arguments).model_dump(exclude_unset=True)
        except ValidationError as exc:
            return {"error": "Invalid tool arguments", "details": exc.errors(include_context=False)}
        try:
            return tool.func(**args)
        except Exception:
            return {"error": "Tool execution failed"}

# --- NESTORA SPATIAL TOOLS ---

class CatalogSearchSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Optional[str] = Field(None, description="Category like 'Vanity & Basin', 'Smart Toilet', 'Shower & Tub', 'Freestanding Tub'")
    max_width: Optional[float] = Field(None, gt=0, description="Maximum width in inches")
    max_depth: Optional[float] = Field(None, gt=0, description="Maximum depth in inches")
    theme: Optional[str] = Field(None, description="Design theme e.g., 'modern_cozy'")
    max_price: Optional[float] = Field(None, gt=0, description="Maximum catalog price in the database currency")

def search_catalog(category: str = None, max_width: float = None, max_depth: float = None, theme: str = None, max_price: float = None) -> dict:
    """Searches the bathroom product catalog for fixtures matching specific dimensions, themes, and budgets."""
    db = SessionLocal()
    try:
        query = db.query(CatalogItemModel).filter(CatalogItemModel.in_stock == True)
        if category:
            query = query.filter(CatalogItemModel.category == category)
        if theme:
            query = query.filter(CatalogItemModel.theme == theme)
        if max_width is not None:
            query = query.filter(CatalogItemModel.width_inches <= max_width)
        if max_depth is not None:
            query = query.filter(CatalogItemModel.depth_inches <= max_depth)
        if max_price is not None:
            query = query.filter(CatalogItemModel.price <= max_price)
        
        # Return top 3 cheapest matches to give the LLM options
        results = query.order_by(CatalogItemModel.price.asc()).limit(3).all()
        if not results:
            return {"results": "No products found matching criteria."}
        
        return {
            "results": [
                {
                    "id": r.id,
                    "name": r.name,
                    "price": r.price,
                    "width_inches": r.width_inches,
                    "depth_inches": r.depth_inches
                } for r in results
            ]
        }
    except Exception as e:
        return {"error": "Catalog search failed"}
    finally:
        db.close()

# Instantiate and bind tools
registry = ToolRegistry()

registry.register(ToolInterface(
    name="search_catalog",
    description="Searches the bathroom product catalog for fixtures matching specific dimensions, themes, and budgets.",
    func=search_catalog,
    schema=CatalogSearchSchema
))