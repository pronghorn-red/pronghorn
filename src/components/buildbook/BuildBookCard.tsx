import { Book, Calendar, Tag } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuildBook } from "@/hooks/useRealtimeBuildBooks";
import { format } from "date-fns";

interface BuildBookCardProps {
  buildBook: BuildBook;
  onClick: () => void;
}

export function BuildBookCard({ buildBook, onClick }: BuildBookCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50 overflow-hidden group"
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="aspect-[16/9] bg-muted relative overflow-hidden">
        {buildBook.cover_image_url ? (
          <img
            src={buildBook.cover_image_url}
            alt={buildBook.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <Book className="h-12 w-12 text-primary/40" />
          </div>
        )}
        {!buildBook.is_published && (
          <Badge variant="secondary" className="absolute top-2 right-2">
            Draft
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-semibold text-lg line-clamp-1 mb-1">{buildBook.name}</h3>
        {buildBook.short_description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {buildBook.short_description}
          </p>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-4 pt-0 flex flex-wrap gap-2">
        {buildBook.tags && buildBook.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 flex-1">
            {buildBook.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag}
              </Badge>
            ))}
            {buildBook.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{buildBook.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {format(new Date(buildBook.updated_at), "MMM d, yyyy")}
        </div>
      </CardFooter>
    </Card>
  );
}
